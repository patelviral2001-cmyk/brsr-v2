import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { ConfirmExtractionDto, ExtractionCallbackDto } from './extraction.dto';
import { fyLabel } from './fy.util';

/**
 * Document-type → suggested KPI codes. The AI engine's payload provides the
 * raw fields; the Evidence Review screen lets the SM map them to KPIs and
 * confirm. These hints drive the default mapping the UI offers.
 */
const SUGGESTED_KPIS: Record<string, string[]> = {
  ELECTRICITY_BILL_V1: ['grid_electricity_kwh'],
  DIESEL_BILL_V1:      ['diesel_stationary_l'],
  WATER_BILL_V1:       ['water_withdrawal_m3'],
  PNG_BILL_V1:         ['png_consumed_m3'],
  UNKNOWN_V1:          [],
};

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditTrailService,
  ) {}

  // AI callback —> ExtractionResult row + Evidence state advance ----
  async handleCallback(dto: ExtractionCallbackDto) {
    const ev = await this.prisma.evidence.findFirst({
      where: { id: dto.documentId, tenantId: dto.tenantId },
    });
    if (!ev) throw new NotFoundException('Evidence not found for callback');

    if (dto.error) {
      await this.prisma.evidence.update({
        where: { id: ev.id },
        data: { status: 'FAILED', failureReason: dto.error.slice(0, 500) },
      });
      return { ok: true };
    }

    // Strip NULL bytes — pdfplumber + Tesseract OCR occasionally emit \x00
    // which PostgreSQL UTF-8 columns reject (error 22021). Sanitize across
    // all string fields and any string values in the JSON payload.
    const sanitize = (v: unknown): unknown => {
      if (typeof v === 'string') return v.split(String.fromCharCode(0)).join('');
      if (Array.isArray(v)) return v.map(sanitize);
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v)) out[k] = sanitize(val);
        return out;
      }
      return v;
    };
    await this.prisma.extractionResult.create({
      data: {
        tenantId: dto.tenantId,
        evidenceId: ev.id,
        schemaCode: dto.schemaCode || 'UNKNOWN_V1',
        payload: (sanitize(dto.payload ?? {}) as object),
        confidence: dto.confidence ?? 0,
        rawText: dto.rawText?.split(String.fromCharCode(0)).join(''),
        status: 'READY',
      },
    });

    await this.prisma.evidence.update({
      where: { id: ev.id },
      data: {
        status: 'REVIEW_NEEDED',
        docType: (dto.docTypeDetected ?? ev.docType) || 'UNKNOWN',
        classifierConfidence: dto.confidence ?? null,
      },
    });
    return { ok: true };
  }

  // Promotion: user-confirmed extraction → DataPoint rows ----------
  async confirm(tenantId: string, evidenceId: string, dto: ConfirmExtractionDto, actorId: string) {
    const ev = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, tenantId },
      include: { extractions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!ev) throw new NotFoundException('Evidence not found');

    const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, tenantId } });
    if (!site) throw new BadRequestException('Site not found in this tenant');

    const periodStart = new Date(dto.periodStart);
    const periodEnd   = new Date(dto.periodEnd);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new BadRequestException('Invalid period');
    }
    if (periodStart > periodEnd) throw new BadRequestException('periodStart must be ≤ periodEnd');

    const re = await this.prisma.reportingEntity.findFirst({
      where: { tenantId, id: dto.reportingEntityId ?? undefined },
    });

    const fy = fyLabel(periodStart);

    const created: any[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const dp of dto.dataPoints) {
        const kpi = await tx.kpi.findUnique({ where: { code: dp.kpiCode } });
        if (!kpi) throw new BadRequestException(`Unknown KPI: ${dp.kpiCode}`);

        // Upsert on uniqueness (tenant, kpi, site, re, periodStart) — re-confirm overwrites.
        const existing = await tx.dataPoint.findFirst({
          where: {
            tenantId, kpiId: kpi.id, siteId: dto.siteId, reportingEntityId: re?.id ?? null,
            periodStart,
          },
        });

        const data = {
          tenantId,
          kpiId: kpi.id,
          siteId: dto.siteId,
          reportingEntityId: re?.id ?? null,
          periodStart,
          periodEnd,
          fy,
          payload: dp.payload as object,
          source: 'EXTRACTED',
          evidenceId,
          extractionResultId: ev.extractions[0]?.id ?? null,
          confidenceScore: dp.confidence ?? ev.extractions[0]?.confidence ?? null,
          status: 'CONFIRMED',
          submittedBy: actorId,
        };

        const row = existing
          ? await tx.dataPoint.update({ where: { id: existing.id }, data })
          : await tx.dataPoint.create({ data });
        created.push(row);
      }

      // Update extraction status + evidence status
      if (ev.extractions[0]) {
        await tx.extractionResult.update({
          where: { id: ev.extractions[0].id },
          data: { status: 'PROMOTED', reviewedBy: actorId, reviewedAt: new Date() },
        });
      }
      await tx.evidence.update({ where: { id: evidenceId }, data: { status: 'CONFIRMED', siteId: dto.siteId } });
    });

    for (const dp of created) {
      await this.audit.log({
        tenantId, userId: actorId, entity: 'DataPoint', entityId: dp.id, action: 'CREATE',
        after: { kpiCode: dto.dataPoints.find(d => true)?.kpiCode, period: dto.periodStart },
      });
    }
    await this.audit.log({
      tenantId, userId: actorId, entity: 'Evidence', entityId: evidenceId, action: 'CONFIRM',
      metadata: { dataPointCount: created.length, siteId: dto.siteId },
    });

    return { ok: true, created };
  }

  async hold(tenantId: string, evidenceId: string, reason: string, actorId: string) {
    const ev = await this.prisma.evidence.findFirst({ where: { id: evidenceId, tenantId } });
    if (!ev) throw new NotFoundException('Evidence not found');
    const updated = await this.prisma.evidence.update({
      where: { id: evidenceId },
      data: { status: 'REVIEW_NEEDED', failureReason: reason.slice(0, 500) },
    });
    await this.audit.log({ tenantId, userId: actorId, entity: 'Evidence', entityId: evidenceId, action: 'UPDATE', metadata: { hold: true, reason } });
    return updated;
  }

  suggestedKpisFor(schemaCode: string): string[] {
    return SUGGESTED_KPIS[schemaCode] ?? [];
  }
}
