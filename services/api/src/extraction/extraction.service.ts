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
    // The page's purpose is "fields that haven't yet reached metric_event":
    // both NEEDS_REVIEW (low-confidence) and DRAFT (fresh, not yet approved).
    // The previous OR filter dropped high-confidence DRAFT rows, so newly
    // extracted bills were invisible to the customer.
    const statusFilter = q.status
      ? { status: q.status as any }
      : { status: { in: ['NEEDS_REVIEW', 'DRAFT'] as string[] } };
    const rows = await (this.prisma as any).extractionField.findMany({
      where: {
        tenantId,
        documentId: q.documentId,
        ...statusFilter,
      },
      include: { document: { select: { id: true, originalName: true, docType: true } } },
      orderBy: [{ confidenceComposite: 'asc' }, { createdAt: 'asc' }],
      take,
    });
    return rows.map((r: any) => this.toClientShape(r));
  }

  // The web (extraction-review) reads fileName / value / confidence / unit /
  // fieldLabel; the DB stores document.originalName / valueText|valueNum /
  // confidenceComposite / unitExtracted / canonicalKey. Map so the UI renders
  // real values instead of "undefined / 0% / Unknown file".
  private toClientShape(f: any) {
    if (!f) return f;
    return {
      ...f,
      fileId: f.documentId,
      fieldKey: f.canonicalKey,
      fieldLabel: f.canonicalKey,
      fileName: f.document?.originalName ?? null,
      value: f.valueText ?? (f.valueNum != null ? Number(f.valueNum) : null),
      confidence: f.confidenceComposite ?? 0,
      unit: f.unitExtracted ?? null,
      pageNumber: f.sourcePage ?? null,
      evidenceText: f.rawText ?? null,
    };
  }

  async getField(tenantId: string, id: string) {
    const field = await (this.prisma as any).extractionField.findFirst({
      where: { id, tenantId },
      include: { document: true },
    });
    if (!field) throw new NotFoundException('Field not found');
    const signedUrl = await this.s3.presignGet(field.document.s3Bucket, field.document.s3Key, 600);
    return { ...this.toClientShape(field), sourcePreviewUrl: signedUrl };
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
    const before = await (this.prisma as any).extractionField.findFirst({
      where: { id, tenantId },
      include: { document: true },
    });
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
    // Promote the approved extraction into a MetricEvent so downstream
    // calculations, framework mappings, and reports can see the value.
    // Without this hop the lineage stops at extraction_field — nothing
    // ever reaches metric_event, calc_run, or any disclosure.
    await this.promoteToMetricEvent({ ...updated, document: before.document }, actorId);
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
    // Promote each newly-approved field. Done sequentially because each
    // promote independently validates registry/unit/period — a partial
    // success is preferable to a transaction-wide rollback that would
    // strand the approval audit log without any metric_events.
    const approvedFields = await (this.prisma as any).extractionField.findMany({
      where: { id: { in: dto.ids }, tenantId, status: 'APPROVED' },
      include: { document: true },
    });
    let promoted = 0;
    for (const f of approvedFields) {
      try {
        const created = await this.promoteToMetricEvent(f, actorId);
        if (created) promoted++;
      } catch {
        // promoteToMetricEvent already logs; continue with the rest.
      }
    }
    return { approved: count, promotedToMetricEvent: promoted };
  }

  /**
   * Create a MetricEvent row from an APPROVED ExtractionField, linking it via
   * sourceExtractionId so the full lineage (document → extraction → metric →
   * calc → report) is queryable. Returns the created event, or null if the
   * promotion was skipped (e.g. unknown canonical_key, missing period).
   */
  private async promoteToMetricEvent(
    field: any,
    actorId: string,
  ): Promise<any | null> {
    // 1. Idempotency — never create two metric_events for the same extraction.
    const existing = await (this.prisma as any).metricEvent.findFirst({
      where: { tenantId: field.tenantId, sourceExtractionId: field.id },
      select: { id: true },
    });
    if (existing) return existing;

    // 2. Canonical-metric registry must know this key. If the DISCOM extractor
    //    emitted a key that's not in canonical_metric, log and skip rather
    //    than silently create an orphan metric_event.
    const reg = await (this.prisma as any).canonicalMetric.findUnique({
      where: { key: field.canonicalKey },
    });
    if (!reg) {
      // logger via audit only — service layer; avoid noise on every approve.
      return null;
    }

    // 3. Period: prefer the field's own period (extractor-parsed), then fall
    //    back to the document's period if present.
    const periodStart: Date | null =
      field.periodStart ?? field.document?.periodStart ?? null;
    const periodEnd: Date | null =
      field.periodEnd ?? field.document?.periodEnd ?? null;
    if (!periodStart || !periodEnd) return null;

    // 4. Numeric value required for a metric_event. Text-only extractions
    //    (narratives, categorical) don't become metric_events.
    if (field.valueNum == null) return null;

    // 5. Unit: trust the extracted unit but ensure it's in the allowed set
    //    for this canonical metric. Mismatch → skip (the extractor is wrong;
    //    forcing a bad unit into metric_event would corrupt downstream calcs).
    const unit: string = field.unitExtracted ?? reg.canonicalUnit ?? '';
    const allowed = (reg.allowedUnits ?? []) as string[];
    if (reg.canonicalUnit && reg.canonicalUnit !== unit && !allowed.includes(unit)) {
      return null;
    }

    // 6. Scope node from the parent document. If the document had no scope
    //    assigned, the metric can't be attributed — skip.
    const scopeNodeId: string | null = field.document?.scopeNodeId ?? null;
    if (!scopeNodeId) return null;

    const event = await (this.prisma as any).metricEvent.create({
      data: {
        tenantId: field.tenantId,
        canonicalKey: field.canonicalKey,
        scopeNodeId,
        periodStart,
        periodEnd,
        value: field.valueNum,
        unit,
        sourceType: 'EXTRACTION' as any,
        sourceExtractionId: field.id,
        confidenceLevel: this.confidenceLevelOf(field.confidenceComposite),
        dataQualityScore: field.confidenceComposite,
        status: 'DRAFT' as any,
        submittedBy: actorId,
        comment: `Auto-promoted from approved extraction ${field.id}`,
      },
    });
    await this.audit.log({
      tenantId: field.tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: event.id,
      action: 'CREATE',
      after: event,
      metadata: { autoPromotedFrom: field.id },
    });
    return event;
  }

  private confidenceLevelOf(score: number | null | undefined): string | null {
    if (score == null) return null;
    if (score >= 0.85) return 'HIGH';
    if (score >= 0.65) return 'MEDIUM';
    return 'LOW';
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
