import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { MagicLinkSigner } from '../common/utils/magic-link';
import { EmailClient } from '../common/utils/email.client';
import { AuditService } from '../audit/audit.service';
import {
  CreateSupplierDto,
  InviteSupplierDto,
  SubmitSupplierResponseDto,
  UpdateSupplierDto,
} from './dto/suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly magic: MagicLinkSigner,
    private readonly email: EmailClient,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, take = 50, skip = 0) {
    return (this.prisma as any).supplier.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async findOne(tenantId: string, id: string) {
    const s = await (this.prisma as any).supplier.findFirst({
      where: { id, tenantId },
    });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async create(tenantId: string, dto: CreateSupplierDto, actorId: string) {
    const s = await (this.prisma as any).supplier.create({
      data: { ...dto, tenantId, status: 'ACTIVE' },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: s.id,
      action: 'create',
      after: s,
    });
    return s;
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto, actorId: string) {
    const before = await this.findOne(tenantId, id);
    const updated = await (this.prisma as any).supplier.update({ where: { id }, data: dto });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: id,
      action: 'update',
      before,
      after: updated,
    });
    return updated;
  }

  async remove(tenantId: string, id: string, actorId: string) {
    const before = await this.findOne(tenantId, id);
    await (this.prisma as any).supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: id,
      action: 'delete',
      before,
    });
  }

  async invite(tenantId: string, id: string, dto: InviteSupplierDto, actorId: string) {
    const supplier = await this.findOne(tenantId, id);
    const to = dto.toEmail ?? supplier.contactEmail;
    const token = this.magic.sign({
      tenantId,
      scope: 'supplier',
      targetId: id,
      ttlSeconds: 60 * 60 * 24 * 60,
      subject: to,
    });
    await (this.prisma as any).supplierInvitation.create({
      data: {
        tenantId,
        supplierId: id,
        magicToken: token,
        questionnaireId: dto.questionnaireId,
        sentAt: new Date(),
        sentTo: to,
      },
    });
    const url = this.magic.buildUrl(token, `/suppliers/portal`);
    await this.email.send({
      to,
      subject: '[BRSR] Supplier questionnaire — action required',
      html: `<p>Hello,</p><p>Please complete your supplier ESG questionnaire:</p><p><a href="${url}">${url}</a></p>`,
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: id,
      action: 'invite',
      metadata: { to },
    });
    return { ok: true };
  }

  // ---- Public portal ----

  async loadPortal(token: string) {
    const verified = this.magic.verify(token);
    if (!verified || verified.scope !== 'supplier') {
      throw new BadRequestException('Invalid or expired token');
    }
    const supplier = await (this.prisma as any).supplier.findFirst({
      where: { id: verified.targetId, tenantId: verified.tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const invitation = await (this.prisma as any).supplierInvitation.findFirst({
      where: { supplierId: supplier.id, magicToken: token },
    });
    const questionnaire = invitation?.questionnaireId
      ? await (this.prisma as any).supplierQuestionnaire.findFirst({
          where: { id: invitation.questionnaireId },
          include: { questions: { orderBy: { sequence: 'asc' } } },
        })
      : await (this.prisma as any).supplierQuestionnaire.findFirst({
          where: { isDefault: true },
          include: { questions: { orderBy: { sequence: 'asc' } } },
        });
    return { supplier: { id: supplier.id, name: supplier.name }, questionnaire };
  }

  async submitResponse(token: string, dto: SubmitSupplierResponseDto) {
    const verified = this.magic.verify(token);
    if (!verified || verified.scope !== 'supplier') {
      throw new BadRequestException('Invalid or expired token');
    }
    const invitation = await (this.prisma as any).supplierInvitation.findFirst({
      where: { magicToken: token, tenantId: verified.tenantId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    return this.prisma.$transaction(async (tx) => {
      const response = await (tx as any).supplierResponse.create({
        data: {
          tenantId: verified.tenantId,
          supplierId: verified.targetId,
          invitationId: invitation.id,
          submittedAt: new Date(),
          answers: { createMany: { data: dto.answers.map((a) => ({ tenantId: verified.tenantId, ...a })) } },
          evidence: dto.evidence?.length
            ? { createMany: { data: dto.evidence.map((e) => ({ tenantId: verified.tenantId, ...e })) } }
            : undefined,
        },
      });
      await (tx as any).supplierInvitation.update({
        where: { id: invitation.id },
        data: { completedAt: new Date() },
      });
      return response;
    });
  }

  /**
   * Simple weighted-question scorer; production replaces this with a registry
   * of category weights per questionnaire version.
   */
  async score(tenantId: string, supplierId: string, actorId: string) {
    const responses = await (this.prisma as any).supplierResponse.findMany({
      where: { tenantId, supplierId },
      include: { answers: true },
      orderBy: { submittedAt: 'desc' },
      take: 1,
    });
    if (responses.length === 0) {
      throw new BadRequestException('No response submitted yet');
    }
    const latest = responses[0];

    let score = new Decimal(0);
    let max = new Decimal(0);
    for (const a of latest.answers) {
      const q: { weight: number | null; idealValue: string | null } | null =
        await (this.prisma as any).supplierQuestion.findUnique({ where: { id: a.questionId } });
      const w = new Decimal(q?.weight ?? 1);
      max = max.plus(w);
      // Heuristic: exact match against idealValue = full weight; nonempty = half.
      if (q?.idealValue && String(a.value).toLowerCase() === q.idealValue.toLowerCase()) {
        score = score.plus(w);
      } else if (a.value !== null && a.value !== undefined && a.value !== '') {
        score = score.plus(w.div(2));
      }
    }
    const pct = max.isZero() ? new Decimal(0) : score.div(max).times(100);
    const grade = pct.gte(85) ? 'A' : pct.gte(70) ? 'B' : pct.gte(50) ? 'C' : pct.gte(30) ? 'D' : 'F';

    const scorecard = await (this.prisma as any).supplierScorecard.create({
      data: {
        tenantId,
        supplierId,
        score: pct,
        grade,
        responseId: latest.id,
        computedAt: new Date(),
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: supplierId,
      action: 'score',
      metadata: { score: pct.toString(), grade },
    });
    return scorecard;
  }

  async aggregateScorecard(tenantId: string) {
    const rows: { supplierId: string; score: Decimal; grade: string }[] =
      await (this.prisma as any).supplierScorecard.findMany({
        where: { tenantId },
        orderBy: { computedAt: 'desc' },
        distinct: ['supplierId'],
      });
    const byGrade: Record<string, number> = {};
    let total = new Decimal(0);
    for (const r of rows) {
      byGrade[r.grade] = (byGrade[r.grade] ?? 0) + 1;
      total = total.plus(r.score);
    }
    return {
      suppliers: rows.length,
      averageScore: rows.length ? total.div(rows.length).toNumber() : 0,
      distribution: byGrade,
    };
  }
}
