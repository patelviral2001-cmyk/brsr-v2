import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Storage } from '../common/utils/s3.client';
import { AuditService } from '../audit/audit.service';
import { ApproveReportDto, FileReportDto } from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Storage,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string, take = 50, skip = 0, fy?: string) {
    // Cap pagination defensively.
    const t = Math.min(Math.max(1, take), 200);
    const s = Math.max(0, skip);
    return (this.prisma as any).report.findMany({
      where: { tenantId, ...(fy ? { fy } : {}) },
      orderBy: { generatedAt: 'desc' },
      take: t,
      skip: s,
    });
  }

  async findOne(tenantId: string, id: string) {
    const r = await (this.prisma as any).report.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  async signedUrl(tenantId: string, id: string, format: 'pdf' | 'xlsx' | 'xbrl') {
    const r = await this.findOne(tenantId, id);
    // Schema columns are pdfS3 / xlsxS3 / xbrlS3 (single S3 key) — there is
    // no per-format bucket column; use the configured reports bucket.
    const key: string | null = r[`${format}S3`];
    if (!key) throw new NotFoundException(`No ${format} output for this report`);
    // Do NOT presign an S3 URL — the deployed S3 endpoint is
    // http://minio:9000 (internal docker network), unreachable from the
    // customer's browser. Mirror the file-view pattern from Module 4: emit
    // a public-base /reports/:id/view URL with a short-lived HMAC token,
    // and let the view route stream the bytes through this API process.
    const exp = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = this.signReportAccessToken(r.id, tenantId, format, exp);
    const base = (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
    const path = `/api/v1/v1/reports/${r.id}/view?format=${format}&access=${token}`;
    return { url: base ? `${base}${path}` : path, format };
  }

  /**
   * HMAC token for report-view auth. Bound to (reportId, tenantId, format,
   * exp) — a token issued for the PDF cannot fetch the XLSX. Reuses the
   * INTERNAL_CALLBACK_SECRET as HMAC key (already a 32+ char per-env
   * secret, same pattern as FilesService).
   */
  signReportAccessToken(
    reportId: string,
    tenantId: string,
    format: 'pdf' | 'xlsx' | 'xbrl',
    exp: number,
  ): string {
    const payload = `${reportId}.${tenantId}.${format}.${exp}`;
    const sig = createHmac('sha256', this.reportAccessSecret()).update(payload).digest('base64url');
    return `${exp}.${sig}`;
  }

  verifyReportAccessToken(
    token: string,
    reportId: string,
    tenantId: string,
    format: 'pdf' | 'xlsx' | 'xbrl',
  ): boolean {
    if (!token || typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot < 1) return false;
    const expStr = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac('sha256', this.reportAccessSecret())
      .update(`${reportId}.${tenantId}.${format}.${exp}`)
      .digest('base64url');
    if (expected.length !== sig.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  }

  private reportAccessSecret(): string {
    const s = this.config.get<string>('INTERNAL_CALLBACK_SECRET');
    if (!s) {
      throw new Error('INTERNAL_CALLBACK_SECRET not configured — cannot sign report access tokens');
    }
    return s;
  }

  /** Used by the /view route to look up the report without a tenant filter
   *  — tenantId is derived from the HMAC token binding. */
  async findOneAcrossTenants(id: string) {
    return (this.prisma as any).report.findUnique({ where: { id } });
  }

  /** Stream the requested format's bytes through this Node process so we
   *  never expose the internal MinIO endpoint to the browser. */
  async streamView(
    tenantId: string,
    id: string,
    format: 'pdf' | 'xlsx' | 'xbrl',
    res: any,
  ): Promise<void> {
    const r = await this.findOne(tenantId, id);
    const key: string | null = r[`${format}S3`];
    if (!key) throw new NotFoundException(`No ${format} output for this report`);
    const bucket = this.s3.bucketReports();
    const buf = await this.s3.get(bucket, key);
    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/xml';
    const filename = `brsr-${r.fy ?? 'report'}.${format}`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buf);
  }

  async approve(tenantId: string, id: string, dto: ApproveReportDto, actorId: string) {
    const r = await this.findOne(tenantId, id);
    if (r.status === 'FILED') throw new ConflictException('Report already filed');
    if (r.status === 'APPROVED') return r;
    // Only completed, reviewable states can be approved. GENERATING means a
    // worker is still producing the report; PUBLISHED is post-filing.
    const approvableFrom = new Set(['DRAFT', 'GENERATED', 'IN_REVIEW']);
    if (!approvableFrom.has(r.status)) {
      throw new ConflictException(
        `Report in status ${r.status} cannot be approved. Must be one of ${[...approvableFrom].join(',')}.`,
      );
    }
    // Segregation of duties: creator can't approve their own report — UNLESS
    // the tenant has no other user with `report.approve`. Forensic Flow #3:
    // a single-admin tenant was permanently stuck at IN_REVIEW.
    if (r.generatedBy === actorId) {
      const otherApprovers = await (this.prisma as any).user.count({
        where: {
          tenantId,
          id: { not: actorId },
          isActive: true,
          roleAssignments: {
            some: { role: { permissions: { has: 'report.approve' } } },
          },
        },
      });
      if (otherApprovers > 0) {
        throw new ConflictException(
          'Creator cannot approve their own report — ask another user with report.approve',
        );
      }
    }
    const updated = await (this.prisma as any).report.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: actorId,
        // No dedicated approvalNotes column; persist on narrativeOverrides.
        narrativeOverrides: {
          ...(r.narrativeOverrides ?? {}),
          approvalNotes: dto.notes ?? null,
          approvedAt: new Date().toISOString(),
        },
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Report',
      entityId: id,
      action: 'APPROVE',
      before: r,
      after: updated,
    });
    return updated;
  }

  async file(tenantId: string, id: string, dto: FileReportDto, actorId: string) {
    const r = await this.findOne(tenantId, id);
    if (r.status !== 'APPROVED') throw new ConflictException('Report must be APPROVED before filing');
    const updated = await (this.prisma as any).report.update({
      where: { id },
      data: {
        status: 'FILED',
        filedWithAuthorityAt: dto.filedAt ? new Date(dto.filedAt) : new Date(),
        narrativeOverrides: {
          ...(r.narrativeOverrides ?? {}),
          filingReference: dto.filingReference,
          filedBy: actorId,
        },
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Report',
      entityId: id,
      action: 'SIGN',
      before: r,
      after: updated,
      metadata: { filingReference: dto.filingReference },
    });
    return updated;
  }
}
