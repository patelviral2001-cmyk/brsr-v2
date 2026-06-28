import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateConversationDto, SendMessageDto } from './dto/copilot.dto';

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async createConversation(tenantId: string, dto: CreateConversationDto, userId: string) {
    // Schema CopilotConversation: tenantId, userId, title, createdAt,
    // lastMessageAt. There is no `context` column.
    const c = await (this.prisma as any).copilotConversation.create({
      data: { tenantId, userId, title: dto.title },
    });
    await this.audit.log({
      tenantId,
      userId,
      entity: 'CopilotConversation',
      entityId: c.id,
      action: 'CREATE',
    });
    return c;
  }

  async listConversations(tenantId: string, userId: string) {
    return (this.prisma as any).copilotConversation.findMany({
      where: { tenantId, userId },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async listMessages(tenantId: string, conversationId: string, userId: string) {
    const conv = await (this.prisma as any).copilotConversation.findFirst({
      where: { id: conversationId, tenantId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return (this.prisma as any).copilotMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }

  /**
   * Streams the copilot response back to the client over SSE. Writes both
   * the user prompt and the streamed assistant reply to the DB so future
   * loads can replay context.
   */
  async streamReply(
    tenantId: string,
    conversationId: string,
    userId: string,
    dto: SendMessageDto,
    res: Response,
  ): Promise<void> {
    const conv = await (this.prisma as any).copilotConversation.findFirst({
      where: { id: conversationId, tenantId, userId },
    });
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Schema CopilotMessage: conversationId, role (USER|ASSISTANT|SYSTEM|TOOL),
    // content. No tenantId on the message — the parent conversation carries it.
    await (this.prisma as any).copilotMessage.create({
      data: { conversationId, role: 'USER', content: dto.content },
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const url = `${this.config.get<string>('COPILOT_URL')}/chat/stream`;
    const headers = {
      'X-Tenant-Id': tenantId,
      'X-User-Id': userId,
      'Content-Type': 'application/json',
      'X-Internal-Secret': this.config.get<string>('INTERNAL_CALLBACK_SECRET') ?? '',
    };

    let assistantBuffer = '';

    try {
      const upstream = await this.http.axiosRef.post(
        url,
        {
          conversation_id: conversationId,
          tenant_id: tenantId,
          user_id: userId,
          message: dto.content,
          // schema has no per-conversation context column; pass an empty
          // object so the upstream contract stays stable.
          context: {},
        },
        { headers, responseType: 'stream', timeout: 120_000 },
      );

      upstream.data.on('data', (chunk: Buffer) => {
        const s = chunk.toString('utf8');
        assistantBuffer += s;
        res.write(s);
      });
      await new Promise<void>((resolve, reject) => {
        upstream.data.on('end', resolve);
        upstream.data.on('error', reject);
      });
    } catch (e) {
      this.logger.error(`Copilot stream failed: ${(e as Error).message}`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: (e as Error).message })}\n\n`);
    } finally {
      res.write('event: done\ndata: {}\n\n');
      res.end();
      try {
        // Persist the assembled assistant reply (best-effort)
        const distilled = distillAssistantText(assistantBuffer);
        if (distilled.length) {
          await (this.prisma as any).copilotMessage.create({
            data: { conversationId, role: 'ASSISTANT', content: distilled },
          });
        }
        await (this.prisma as any).copilotConversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() },
        });
      } catch (persistErr) {
        this.logger.warn(`Failed to persist assistant message: ${(persistErr as Error).message}`);
      }
    }
  }
}

/**
 * Pulls the textual `data:` payloads out of an SSE stream so we can store a
 * single coherent assistant message. Unknown event types are ignored.
 */
function distillAssistantText(sse: string): string {
  return sse
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter((l) => l && l !== '[DONE]')
    .map((l) => {
      try {
        const obj = JSON.parse(l);
        if (typeof obj === 'string') return obj;
        if (typeof obj?.delta === 'string') return obj.delta;
        if (typeof obj?.content === 'string') return obj.content;
        return '';
      } catch {
        return l;
      }
    })
    .join('');
}
