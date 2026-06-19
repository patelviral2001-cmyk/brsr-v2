import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateMetricEventDto,
  MetricEventStatus,
  MetricSource,
  QueryMetricsDto,
  RejectMetricDto,
  UpdateMetricEventDto,
} from './dto/metrics.dto';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Registry ----

  async listRegistry(filter: { category?: string; framework?: string }) {
    // CanonicalMetric PK is `key`. No `frameworks` array column; the
    // canonical-to-framework cross-walk lives in FrameworkMapping.
    if (filter.framework) {
      const mappings = await (this.prisma as any).frameworkMapping.findMany({
        where: { framework: filter.framework },
        select: { canonicalKeys: true },
      });
      const keys = Array.from(new Set(mappings.flatMap((m: { canonicalKeys: string[] }) => m.canonicalKeys ?? [])));
      return (this.prisma as any).canonicalMetric.findMany({
        where: {
          key: { in: keys as string[] },
          category: filter.category as any,
          isActive: true,
        },
        orderBy: { key: 'asc' },
      });
    }
    return (this.prisma as any).canonicalMetric.findMany({
      where: { category: filter.category as any, isActive: true },
      orderBy: { key: 'asc' },
    });
  }

  async getRegistry(canonicalKey: string) {
    const reg = await (this.prisma as any).canonicalMetric.findUnique({
      where: { key: canonicalKey },
    });
    if (!reg) throw new NotFoundException('Metric not in registry');
    const mappings = await (this.prisma as any).frameworkMapping.findMany({
      where: { canonicalKeys: { has: canonicalKey } },
    });
    return { ...reg, mappings };
  }

  // ---- Events ----

  /** Map DTO MetricSource to schema MetricSourceType enum. */
  private mapSource(s: MetricSource | undefined): string {
    switch (s) {
      case MetricSource.EXTRACTED:
        return 'EXTRACTION';
      case MetricSource.CALCULATED:
        return 'CALCULATION';
      case MetricSource.ERP:
        return 'API';
      case MetricSource.IMPORTED:
      case MetricSource.MANUAL:
      default:
        return 'MANUAL';
    }
  }

  async create(tenantId: string, dto: CreateMetricEventDto, actorId: string) {
    // Validate scope node belongs to this tenant first to avoid leaking via FK.
    const scope = await (this.prisma as any).entityNode.findFirst({
      where: { id: dto.scopeNodeId, tenantId },
      select: { id: true },
    });
    if (!scope) throw new BadRequestException('scopeNodeId not found in this tenant');

    const reg = await (this.prisma as any).canonicalMetric.findUnique({
      where: { key: dto.canonicalKey },
    });
    if (!reg) throw new BadRequestException(`Unknown metric: ${dto.canonicalKey}`);
    const allowed = (reg.allowedUnits ?? []) as string[];
    if (reg.canonicalUnit && reg.canonicalUnit !== dto.unit && !allowed.includes(dto.unit)) {
      throw new BadRequestException(`Unit mismatch: expected ${reg.canonicalUnit}, got ${dto.unit}`);
    }
    if (new Date(dto.periodStart) > new Date(dto.periodEnd)) {
      throw new BadRequestException('periodStart must be <= periodEnd');
    }

    const event = await (this.prisma as any).metricEvent.create({
      data: {
        tenantId,
        canonicalKey: dto.canonicalKey,
        scopeNodeId: dto.scopeNodeId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        value: new Decimal(dto.value),
        unit: dto.unit,
        sourceType: this.mapSource(dto.source),
        sourceExtractionId: dto.extractionFieldId,
        comment: dto.notes,
        dimensions: dto.metadata ?? {},
        status: MetricEventStatus.DRAFT as any,
        submittedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: event.id,
      action: 'create',
      after: event,
    });
    return event;
  }

  async query(tenantId: string, dto: QueryMetricsDto) {
    return (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        canonicalKey: dto.canonicalKey,
        scopeNodeId: dto.scopeNodeIds && dto.scopeNodeIds.length ? { in: dto.scopeNodeIds } : undefined,
        periodStart: dto.from ? { gte: new Date(dto.from) } : undefined,
        periodEnd: dto.to ? { lte: new Date(dto.to) } : undefined,
        status: dto.status && dto.status.length ? { in: dto.status } : undefined,
      },
      orderBy: { periodEnd: 'desc' },
      take: dto.take ?? 200,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateMetricEventDto, actorId: string) {
    const e = await this.findOne(tenantId, id);
    if (![MetricEventStatus.DRAFT, MetricEventStatus.SUBMITTED].includes(e.status)) {
      throw new ConflictException(`Cannot edit a metric in status ${e.status}`);
    }
    // If caller is moving the metric under a different scope, re-validate
    // ownership to prevent cross-tenant relinking.
    if (dto.scopeNodeId && dto.scopeNodeId !== e.scopeNodeId) {
      const scope = await (this.prisma as any).entityNode.findFirst({
        where: { id: dto.scopeNodeId, tenantId },
        select: { id: true },
      });
      if (!scope) throw new BadRequestException('scopeNodeId not found in this tenant');
    }
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: {
        value: dto.value !== undefined ? new Decimal(dto.value) : undefined,
        unit: dto.unit,
        scopeNodeId: dto.scopeNodeId,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
        comment: dto.notes,
        dimensions: dto.metadata,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'UPDATE',
      before: e,
      after: updated,
    });
    return updated;
  }

  async findOne(tenantId: string, id: string) {
    const e = await (this.prisma as any).metricEvent.findFirst({
      where: { id, tenantId },
    });
    if (!e) throw new NotFoundException('Metric event not found');
    return e;
  }

  async submit(tenantId: string, id: string, actorId: string) {
    const e = await this.findOne(tenantId, id);
    if (e.status !== MetricEventStatus.DRAFT) {
      throw new ConflictException(`Cannot submit metric in status ${e.status}`);
    }
    // Schema MetricStatus enum: DRAFT|SUBMITTED|REVIEWED|APPROVED|LOCKED.
    // submittedBy is on every row; updated to current actor on transition.
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), submittedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'UPDATE',
      before: e,
      after: updated,
      metadata: { transition: 'SUBMITTED' },
    });
    return updated;
  }

  async approve(tenantId: string, id: string, actorId: string) {
    const e = await this.findOne(tenantId, id);
    if (e.status !== MetricEventStatus.SUBMITTED) {
      throw new ConflictException(`Can only approve a SUBMITTED metric (got ${e.status})`);
    }
    if (e.submittedBy === actorId) {
      throw new ConflictException('Submitter cannot approve their own entry (segregation of duties)');
    }
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'APPROVE',
      before: e,
      after: updated,
    });
    return updated;
  }

  async reject(tenantId: string, id: string, dto: RejectMetricDto, actorId: string) {
    const e = await this.findOne(tenantId, id);
    if (e.status !== MetricEventStatus.SUBMITTED) {
      throw new ConflictException(`Can only reject a SUBMITTED metric`);
    }
    // Schema has no REJECTED MetricStatus value; the closest is to revert to
    // DRAFT and record the rejection reason in `comment`. This keeps the
    // audit trail visible while letting submitters edit and resubmit.
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: {
        status: 'DRAFT',
        comment: `[REJECTED ${new Date().toISOString()} by ${actorId}] ${dto.reason}`,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'REJECT',
      before: e,
      after: updated,
      metadata: { reason: dto.reason },
    });
    return updated;
  }

  async lock(tenantId: string, id: string, actorId: string) {
    const e = await this.findOne(tenantId, id);
    if (e.status !== MetricEventStatus.APPROVED) {
      throw new ConflictException('Only APPROVED metrics can be locked');
    }
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: { status: 'LOCKED' },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'LOCK',
      before: e,
      after: updated,
    });
    return updated;
  }

  // ---- Bulk import XLSX ----

  async bulkImportXlsx(tenantId: string, file: Buffer, actorId: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file);
    const sheet = wb.getWorksheet('metrics') ?? wb.worksheets[0];
    if (!sheet) throw new BadRequestException('No worksheet found');

    const headerRow = sheet.getRow(1);
    const headers: Record<number, string> = {};
    headerRow.eachCell((cell, col) => {
      headers[col] = String(cell.value ?? '').trim();
    });

    const required = ['canonicalKey', 'scopeNodeId', 'periodStart', 'periodEnd', 'value', 'unit'];
    for (const r of required) {
      if (!Object.values(headers).includes(r)) {
        throw new BadRequestException(`Missing required column: ${r}`);
      }
    }

    const created: unknown[] = [];
    const errors: string[] = [];
    const rowCount = sheet.rowCount;

    await this.prisma.$transaction(async (tx) => {
      for (let r = 2; r <= rowCount; r++) {
        const row = sheet.getRow(r);
        const data: Record<string, unknown> = {};
        row.eachCell((cell, col) => {
          const h = headers[col];
          if (h) data[h] = cell.value;
        });
        if (Object.keys(data).length === 0) continue;
        try {
          const event = await (tx as any).metricEvent.create({
            data: {
              tenantId,
              canonicalKey: String(data.canonicalKey),
              scopeNodeId: String(data.scopeNodeId),
              periodStart: new Date(String(data.periodStart)),
              periodEnd: new Date(String(data.periodEnd)),
              value: new Decimal(String(data.value)),
              unit: String(data.unit),
              sourceType: 'MANUAL',
              comment: data.notes ? String(data.notes) : null,
              dimensions: {},
              status: 'DRAFT',
              submittedBy: actorId,
            },
          });
          created.push(event);
        } catch (e) {
          errors.push(`Row ${r}: ${(e as Error).message}`);
        }
      }
    });

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: null,
      action: 'CREATE',
      metadata: { bulkImport: true, inserted: created.length, errors: errors.length },
    });
    // Forensic Flow #6: also emit per-id audit rows so the per-entity
    // drill-down view finds the change. Rollup row above stays as the
    // batch summary; these are the indexable references.
    for (const ev of created as { id: string }[]) {
      await this.audit.log({
        tenantId,
        userId: actorId,
        entity: 'MetricEvent',
        entityId: ev.id,
        action: 'CREATE',
        metadata: { viaBulk: true },
      });
    }
    return { inserted: created.length, errors };
  }
}
