import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

  async list(tenantId: string, take = 50, skip = 0) {
    // Cap pagination defensively.
    const t = Math.min(Math.max(1, take), 200);
    const s = Math.max(0, skip);
    return (this.prisma as any).report.findMany({
      where: { tenantId },
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
    const bucket = this.s3.bucketReports();
    // 5-min TTL for previews/downloads — short enough that leaked links die fast.
    const url = await this.s3.presignGet(bucket, key, 5 * 60);
    return { url, format };
  }

  async approve(tenantId: string, id: string, dto: ApproveReportDto, actorId: string) {
    const r = await this.findOne(tenantId, id);
    if (r.status === 'FILED') throw new ConflictException('Report already filed');
    if (r.status === 'APPROVED') return r;
    // Schema: Report.generatedBy is the author; segregate-of-duties check
    // refuses self-approval.
    if (r.generatedBy === actorId) {
      throw new ConflictException('Creator cannot approve their own report');
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
