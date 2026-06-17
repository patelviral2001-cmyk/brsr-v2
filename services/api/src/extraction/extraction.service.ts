import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { S3Storage } from '../common/utils/s3.client';
import { AuditService } from '../audit/audit.service';
import {
  BulkApproveDto,
  ExtractionQueueQueryDto,
  RejectExtractionFieldDto,
  UpdateExtractionFieldDto,
} from './dto/extraction.dto';

@Injectable()
export class ExtractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Storage,
    private readonly audit: AuditService,
  ) {}

  async queue(tenantId: string, q: ExtractionQueueQueryDto) {
    const maxConf = q.maxConfidence ?? 0.85;
    return (this.prisma as any).extractionField.findMany({
      where: {
        tenantId,
        documentId: q.documentId,
        OR: [{ confidence: { lt: new Decimal(maxConf) } }, { status: 'NEEDS_REVIEW' }],
        status: q.status ?? { in: ['NEEDS_REVIEW', 'AUTO_ACCEPTED'] },
      },
      include: { document: { select: { id: true, originalName: true, docType: true } } },
      orderBy: [{ confidence: 'asc' }, { createdAt: 'asc' }],
      take: q.take ?? 50,
    });
  }

  async getField(tenantId: string, id: string) {
    const field = await (this.prisma as any).extractionField.findFirst({
      where: { id, tenantId },
      include: { document: true },
    });
    if (!field) throw new NotFoundException('Field not found');
    const signedUrl = await this.s3.presignGet(field.document.s3Bucket, field.document.s3Key, 600);
    return { ...field, sourcePreviewUrl: signedUrl };
  }

  async update(tenantId: string, id: string, dto: UpdateExtractionFieldDto, actorId: string) {
    const before = await (this.prisma as any).extractionField.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Field not found');
    if (before.status === 'APPROVED') throw new ConflictException('Field already approved');

    const updated = await (this.prisma as any).extractionField.update({
      where: { id },
      data: {
        value: typeof dto.value === 'object' ? dto.value : { v: dto.value },
        unit: dto.unit ?? before.unit,
        reviewerNotes: dto.notes,
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'ExtractionField',
      entityId: id,
      action: 'override',
      before,
      after: updated,
    });
    return updated;
  }

  async approve(tenantId: string, id: string, actorId: string) {
    const before = await (this.prisma as any).extractionField.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Field not found');
    if (before.status === 'APPROVED') return before;

    const updated = await (this.prisma as any).extractionField.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'ExtractionField',
      entityId: id,
      action: 'approve',
      before,
      after: updated,
    });
    return updated;
  }

  async reject(tenantId: string, id: string, dto: RejectExtractionFieldDto, actorId: string) {
    const before = await (this.prisma as any).extractionField.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Field not found');
    const updated = await (this.prisma as any).extractionField.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewerNotes: dto.reason,
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'ExtractionField',
      entityId: id,
      action: 'reject',
      before,
      after: updated,
      metadata: { reason: dto.reason },
    });
    return updated;
  }

  async bulkApprove(tenantId: string, dto: BulkApproveDto, actorId: string) {
    const { count } = await (this.prisma as any).extractionField.updateMany({
      where: { id: { in: dto.ids }, tenantId, status: { not: 'APPROVED' } },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'ExtractionField',
      entityId: null,
      action: 'bulk_approve',
      metadata: { count, ids: dto.ids },
    });
    return { approved: count };
  }

  async stats(tenantId: string) {
    const byStatus: { status: string; _count: { _all: number } }[] =
      await (this.prisma as any).extractionField.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      });
    const recent: { _count: { _all: number } } = await (this.prisma as any).extractionField.aggregate({
      where: { tenantId, reviewedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      _count: { _all: true },
    });
    const lowConfidence: number = await (this.prisma as any).extractionField.count({
      where: { tenantId, confidence: { lt: new Decimal(0.85) }, status: { not: 'APPROVED' } },
    });
    return {
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      reviewedLast24h: recent._count._all,
      pendingLowConfidence: lowConfidence,
    };
  }
}
