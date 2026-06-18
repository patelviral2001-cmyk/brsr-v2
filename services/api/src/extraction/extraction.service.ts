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
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    // Schema ExtractionStatus enum: DRAFT|NEEDS_REVIEW|APPROVED|REJECTED|OVERRIDDEN.
    // AUTO_ACCEPTED does not exist.
    const status = q.status
      ? { status: q.status as any }
      : { status: { in: ['NEEDS_REVIEW', 'DRAFT'] as string[] } };
    return (this.prisma as any).extractionField.findMany({
      where: {
        tenantId,
        documentId: q.documentId,
        OR: [{ confidenceComposite: { lt: maxConf } }, { status: 'NEEDS_REVIEW' }],
        ...status,
      },
      include: { document: { select: { id: true, originalName: true, docType: true } } },
      orderBy: [{ confidenceComposite: 'asc' }, { createdAt: 'asc' }],
      take,
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

    // Schema columns: valueText, valueNum, unitExtracted, overrideReason,
    // reviewedBy, reviewedAt. Decide numeric vs textual based on input.
    const isNumeric = typeof dto.value === 'number' || (typeof dto.value === 'string' && /^-?\d+(\.\d+)?$/.test(dto.value));
    const updated = await (this.prisma as any).extractionField.update({
      where: { id },
      data: {
        valueText: isNumeric ? null : (typeof dto.value === 'object' ? JSON.stringify(dto.value) : String(dto.value ?? '')),
        valueNum: isNumeric ? new Decimal(String(dto.value)) : null,
        unitExtracted: dto.unit ?? before.unitExtracted,
        overrideReason: dto.notes,
        status: 'OVERRIDDEN',
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'ExtractionField',
      entityId: id,
      action: 'OVERRIDE',
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
        overrideReason: dto.reason,
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'ExtractionField',
      entityId: id,
      action: 'REJECT',
      before,
      after: updated,
      metadata: { reason: dto.reason },
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
      action: 'APPROVE',
      before,
      after: updated,
    });
    return updated;
  }

  async bulkApprove(tenantId: string, dto: BulkApproveDto, actorId: string) {
    if (!dto.ids?.length) return { approved: 0 };
    if (dto.ids.length > 1000) {
      throw new ConflictException('Bulk-approve capped at 1,000 ids per request');
    }
    const { count } = await (this.prisma as any).extractionField.updateMany({
      where: { id: { in: dto.ids }, tenantId, status: { not: 'APPROVED' } },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'ExtractionField',
      entityId: null,
      action: 'APPROVE',
      metadata: { bulkApprove: true, count, ids: dto.ids },
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
      where: { tenantId, confidenceComposite: { lt: 0.85 }, status: { not: 'APPROVED' } },
    });
    return {
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      reviewedLast24h: recent._count._all,
      pendingLowConfidence: lowConfidence,
    };
  }
}
