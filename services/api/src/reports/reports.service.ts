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
    return (this.prisma as any).report.findMany({
      where: { tenantId },
      orderBy: { generatedAt: 'desc' },
      take,
      skip,
    });
  }

  async findOne(tenantId: string, id: string) {
    const r = await (this.prisma as any).report.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  async signedUrl(tenantId: string, id: string, format: 'pdf' | 'xlsx' | 'xbrl') {
    const r = await this.findOne(tenantId, id);
    const key: string | null = r[`${format}S3Key`];
    const bucket: string | null = r[`${format}S3Bucket`];
    if (!key || !bucket) throw new NotFoundException(`No ${format} output for this report`);
    const url = await this.s3.presignGet(bucket, key, 600);
    return { url, format };
  }

  async approve(tenantId: string, id: string, dto: ApproveReportDto, actorId: string) {
    const r = await this.findOne(tenantId, id);
    if (r.status === 'FILED') throw new ConflictException('Report already filed');
    if (r.status === 'APPROVED') return r;
    if (r.createdBy === actorId) {
      throw new ConflictException('Creator cannot approve their own report');
    }
    const updated = await (this.prisma as any).report.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: actorId, approvalNotes: dto.notes },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Report',
      entityId: id,
      action: 'approve',
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
        filedAt: dto.filedAt ? new Date(dto.filedAt) : new Date(),
        filingReference: dto.filingReference,
        filedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Report',
      entityId: id,
      action: 'file',
      before: r,
      after: updated,
    });
    return updated;
  }
}
