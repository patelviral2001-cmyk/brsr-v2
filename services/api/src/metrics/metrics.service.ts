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
    return (this.prisma as any).canonicalMetric.findMany({
      where: {
        category: filter.category,
        frameworks: filter.framework ? { has: filter.framework } : undefined,
      },
      orderBy: { canonicalKey: 'asc' },
    });
  }

  async getRegistry(canonicalKey: string) {
    const reg = await (this.prisma as any).canonicalMetric.findFirst({
      where: { canonicalKey },
      include: { mappings: true },
    });
    if (!reg) throw new NotFoundException('Metric not in registry');
    return reg;
  }

  // ---- Events ----

  async create(tenantId: string, dto: CreateMetricEventDto, actorId: string) {
    const reg = await (this.prisma as any).canonicalMetric.findFirst({
      where: { canonicalKey: dto.canonicalKey },
    });
    if (!reg) throw new BadRequestException(`Unknown metric: ${dto.canonicalKey}`);
    if (reg.unit && reg.unit !== dto.unit) {
      throw new BadRequestException(`Unit mismatch: expected ${reg.unit}, got ${dto.unit}`);
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
        source: dto.source ?? MetricSource.MANUAL,
        documentId: dto.documentId,
        extractionFieldId: dto.extractionFieldId,
        notes: dto.notes,
        metadata: dto.metadata ?? {},
        status: MetricEventStatus.DRAFT,
        createdBy: actorId,
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
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: {
        value: dto.value !== undefined ? new Decimal(dto.value) : undefined,
        unit: dto.unit,
        scopeNodeId: dto.scopeNodeId,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
        notes: dto.notes,
        metadata: dto.metadata,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'update',
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
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: { status: MetricEventStatus.SUBMITTED, submittedAt: new Date(), submittedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'submit',
      before: e,
      after: updated,
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
      data: { status: MetricEventStatus.APPROVED, approvedAt: new Date(), approvedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'approve',
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
    const updated = await (this.prisma as any).metricEvent.update({
      where: { id },
      data: {
        status: MetricEventStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedBy: actorId,
        rejectionReason: dto.reason,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'reject',
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
      data: { status: MetricEventStatus.LOCKED, lockedAt: new Date(), lockedBy: actorId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MetricEvent',
      entityId: id,
      action: 'lock',
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
              source: MetricSource.IMPORTED,
              notes: data.notes ? String(data.notes) : null,
              metadata: {},
              status: MetricEventStatus.DRAFT,
              createdBy: actorId,
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
      action: 'bulk_import',
      metadata: { inserted: created.length, errors: errors.length },
    });
    return { inserted: created.length, errors };
  }
}
