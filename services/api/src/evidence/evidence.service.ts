import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Storage } from '../common/utils/s3.client';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { UploadEvidenceDto } from './dto/evidence.dto';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'image/png',
  'image/jpeg',
]);
const MAX_BYTES = 50 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function sanitizeFilename(name: string): string {
  if (!name) return 'file';
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  return base
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/["'`$<>|;\r\n]/g, '_')
    .trim()
    .slice(0, 200) || 'file';
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Storage,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly audit: AuditTrailService,
  ) {}

  // Upload ------------------------------------------------------
  async upload(
    tenantId: string,
    actorId: string,
    file: Express.Multer.File,
    dto: UploadEvidenceDto,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_BYTES) throw new BadRequestException(`File exceeds 50MB (${file.size} bytes)`);

    const safeName = sanitizeFilename(file.originalname);
    const ext = safeName.split('.').pop()?.toLowerCase() ?? 'bin';
    const effectiveMime = ALLOWED_MIME.has(file.mimetype) ? file.mimetype : (EXT_TO_MIME[ext] ?? 'application/octet-stream');
    if (!ALLOWED_MIME.has(effectiveMime)) {
      throw new BadRequestException(`Unsupported file. Allowed: PDF, XLSX, XLS, CSV, PNG, JPG.`);
    }

    // Confirm site belongs to tenant (if supplied)
    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, tenantId }, select: { id: true } });
      if (!site) throw new BadRequestException('Site not found in this tenant');
    }

    const bucket = this.s3.bucketEvidence();
    const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
    const s3Key = `t/${tenantId}/${new Date().toISOString().slice(0, 10)}/${uuidv4()}.${safeExt}`;
    await this.s3.put({
      bucket, key: s3Key, body: file.buffer, contentType: effectiveMime,
      metadata: { tenantId, uploaderId: actorId, originalName: safeName },
    });

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Dedup
    const existing = await this.prisma.evidence.findUnique({ where: { tenantId_sha256: { tenantId, sha256 } } });
    if (existing) {
      this.logger.log(`Duplicate evidence upload (sha256=${sha256.slice(0, 8)}); returning existing ${existing.id}`);
      return existing;
    }

    const docType = (dto.docTypeHint ?? 'UNKNOWN').toUpperCase();
    const evidence = await this.prisma.evidence.create({
      data: {
        tenantId,
        siteId: dto.siteId,
        originalName: safeName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256,
        s3Bucket: bucket,
        s3Key,
        docType,
        hintPeriodStart: dto.hintPeriodStart ? new Date(dto.hintPeriodStart) : null,
        hintPeriodEnd: dto.hintPeriodEnd ? new Date(dto.hintPeriodEnd) : null,
        uploadedBy: actorId,
        status: 'PENDING',
      },
    });

    // Fire-and-forget extraction dispatch.
    void this.dispatchExtraction(evidence.id, tenantId, s3Key, dto.docTypeHint);

    await this.audit.log({
      tenantId, userId: actorId, entity: 'Evidence', entityId: evidence.id, action: 'UPLOAD',
      after: { id: evidence.id, originalName: evidence.originalName, sizeBytes: file.size, docType },
    });
    return evidence;
  }

  private async dispatchExtraction(evidenceId: string, tenantId: string, s3Key: string, docTypeHint?: string) {
    try {
      const aiUrl = `${this.config.get<string>('AI_ENGINE_URL')}/extract`;
      const presigned = await this.s3.presignGet(this.s3.bucketEvidence(), s3Key, 60 * 60);
      const internalApiBase = this.config.get<string>('INTERNAL_API_URL') ?? 'http://api:4000';
      const callbackUrl = `${internalApiBase}/api/v1/v1/extraction/callback`;
      await firstValueFrom(this.http.post(aiUrl, {
        file_id: evidenceId,
        s3_url: presigned,
        tenant_id: tenantId,
        doc_type_hint: docTypeHint,
        callback_url: callbackUrl,
        callback_secret_header: 'x-internal-secret',
      }));
      await this.prisma.evidence.update({ where: { id: evidenceId }, data: { status: 'CLASSIFIED' } });
    } catch (e) {
      this.logger.warn(`AI dispatch failed for evidence ${evidenceId}: ${(e as Error).message}`);
      await this.prisma.evidence.update({
        where: { id: evidenceId },
        data: { status: 'FAILED', failureReason: (e as Error).message.slice(0, 500) },
      });
    }
  }

  // Read ---------------------------------------------------------
  async list(tenantId: string, params: { status?: string; siteId?: string; docType?: string; take?: number; skip?: number }) {
    const take = Math.min(Math.max(1, params.take ?? 50), 200);
    const rows = await this.prisma.evidence.findMany({
      where: {
        tenantId,
        status: params.status,
        siteId: params.siteId,
        docType: params.docType,
      },
      include: { site: true, _count: { select: { extractions: true } } },
      orderBy: { uploadedAt: 'desc' },
      take,
      skip: params.skip ?? 0,
    });
    return rows.map((r) => ({
      ...r,
      sizeBytes: typeof r.sizeBytes === 'bigint' ? Number(r.sizeBytes) : r.sizeBytes,
      signedUrl: this.buildViewUrl(r.id, tenantId),
    }));
  }

  async findOne(tenantId: string, id: string) {
    const ev = await this.prisma.evidence.findFirst({
      where: { id, tenantId },
      include: {
        site: true,
        extractions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!ev) throw new NotFoundException('Evidence not found');
    const view = this.buildViewUrl(ev.id, tenantId);
    return {
      ...ev,
      sizeBytes: typeof ev.sizeBytes === 'bigint' ? Number(ev.sizeBytes) : ev.sizeBytes,
      signedUrl: view,
    };
  }

  // Update siteId (after user picks a Site on the Review screen)
  async attachSite(tenantId: string, id: string, siteId: string, actorId: string) {
    const ev = await this.findOne(tenantId, id);
    const site = await this.prisma.site.findFirst({ where: { id: siteId, tenantId } });
    if (!site) throw new BadRequestException('Site not found in this tenant');
    const updated = await this.prisma.evidence.update({ where: { id }, data: { siteId } });
    await this.audit.log({ tenantId, userId: actorId, entity: 'Evidence', entityId: id, action: 'UPDATE', before: ev, after: updated });
    return updated;
  }

  // Streaming view (HMAC token) ---------------------------------
  buildViewUrl(evidenceId: string, tenantId: string) {
    const exp = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = this.signAccessToken(evidenceId, tenantId, exp);
    const base = (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
    const path = `/api/v1/v1/evidence/${evidenceId}/view?access=${token}`;
    return base ? `${base}${path}` : path;
  }

  private accessSecret(): string {
    const s = this.config.get<string>('INTERNAL_CALLBACK_SECRET');
    if (!s) throw new Error('INTERNAL_CALLBACK_SECRET not configured');
    return s;
  }

  signAccessToken(evidenceId: string, tenantId: string, exp: number): string {
    const payload = `${evidenceId}.${tenantId}.${exp}`;
    const sig = createHmac('sha256', this.accessSecret()).update(payload).digest('base64url');
    return `${exp}.${sig}`;
  }

  verifyAccessToken(token: string, evidenceId: string, tenantId: string): boolean {
    if (!token) return false;
    const dot = token.indexOf('.');
    if (dot < 1) return false;
    const expStr = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac('sha256', this.accessSecret())
      .update(`${evidenceId}.${tenantId}.${exp}`).digest('base64url');
    if (expected.length !== sig.length) return false;
    try { return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)); }
    catch { return false; }
  }

  async findOneAcrossTenants(id: string) {
    return this.prisma.evidence.findUnique({ where: { id } });
  }

  async streamView(tenantId: string, id: string, res: any) {
    const ev = await this.prisma.evidence.findFirst({ where: { id, tenantId } });
    if (!ev) throw new NotFoundException('Evidence not found');
    const buf = await this.s3.get(ev.s3Bucket, ev.s3Key);
    res.setHeader('Content-Type', ev.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Content-Disposition', `inline; filename="${ev.originalName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buf);
  }
}
