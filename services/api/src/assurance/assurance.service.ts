import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashObject } from '../common/utils/hash';
import {
  CreateExceptionDto,
  CreateSnapshotDto,
  RespondExceptionDto,
  SampleSnapshotDto,
  SamplingMethod,
} from './dto/assurance.dto';

@Injectable()
export class AssuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateSnapshotDto, actorId: string) {
    // Lock data: snapshot all APPROVED metric events for fy/scope into AssuranceSnapshotItem
    const events = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        scopeNodeId: { in: dto.scopeNodeIds },
        status: { in: ['APPROVED', 'LOCKED'] },
        
      },
      orderBy: { id: 'asc' },
    });

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const snap = await (tx as any).assuranceSnapshot.create({
        data: {
          tenantId,
          fy: dto.fy,
          framework: dto.framework,
          scopeNodeIds: dto.scopeNodeIds,
          itemCount: events.length,
          note: dto.note,
          contentHash: hashObject(events.map((e: any) => ({ id: e.id, value: e.value?.toString?.(), unit: e.unit }))),
          createdBy: actorId,
          status: 'OPEN',
        },
      });
      if (events.length) {
        await (tx as any).assuranceSnapshotItem.createMany({
          data: events.map((e: any) => ({
            tenantId,
            snapshotId: snap.id,
            metricEventId: e.id,
            canonicalKey: e.canonicalKey,
            value: e.value,
            unit: e.unit,
            documentId: e.documentId,
            extractionFieldId: e.extractionFieldId,
            calcRunId: e.calcRunId,
          })),
        });
      }
      return snap;
    });

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AssuranceSnapshot',
      entityId: snapshot.id,
      action: 'create',
      after: snapshot,
    });
    return snapshot;
  }

  async list(tenantId: string) {
    return (this.prisma as any).assuranceSnapshot.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Full lineage trace for a metric key inside a snapshot:
   *   Document → ExtractionField → MetricEvent → CalcRun (steps) → BRSR section
   */
  async walkthrough(tenantId: string, snapshotId: string, metricKey: string) {
    const snap = await (this.prisma as any).assuranceSnapshot.findFirst({
      where: { id: snapshotId, tenantId },
    });
    if (!snap) throw new NotFoundException('Snapshot not found');

    const items = await (this.prisma as any).assuranceSnapshotItem.findMany({
      where: { snapshotId, canonicalKey: metricKey },
      include: {
        metricEvent: true,
        document: true,
        extractionField: true,
        calcRun: { include: { steps: { where: { outputKey: metricKey } } } },
      },
    });

    const sectionMappings = await (this.prisma as any).frameworkMapping.findMany({
      where: { framework: snap.framework, canonicalKey: metricKey },
    });

    return {
      snapshotId,
      metricKey,
      framework: snap.framework,
      sections: sectionMappings.map((m: { sectionId: string; label: string }) => ({
        sectionId: m.sectionId,
        label: m.label,
      })),
      lineage: items.map((i: any) => ({
        metricEvent: i.metricEvent,
        document: i.document,
        extractionField: i.extractionField,
        calcRun: i.calcRun,
      })),
    };
  }

  /** Pseudo-random/stratified sample of snapshot items. */
  async sample(tenantId: string, snapshotId: string, dto: SampleSnapshotDto) {
    const items: { id: string; canonicalKey: string; value: unknown }[] =
      await (this.prisma as any).assuranceSnapshotItem.findMany({
        where: { snapshotId, tenantId, canonicalKey: dto.canonicalKey },
      });
    if (items.length === 0) return [];

    if (dto.method === SamplingMethod.RANDOM) {
      return shuffle(items).slice(0, dto.size);
    }
    if (dto.method === SamplingMethod.HIGH_VALUE) {
      const sorted = items
        .slice()
        .sort((a, b) => Number(b.value) - Number(a.value));
      return sorted.slice(0, dto.size);
    }
    // STRATIFIED — equal-allocation across distinct canonicalKey buckets
    const buckets = new Map<string, typeof items>();
    for (const it of items) {
      const arr = buckets.get(it.canonicalKey) ?? [];
      arr.push(it);
      buckets.set(it.canonicalKey, arr);
    }
    const perBucket = Math.max(1, Math.floor(dto.size / buckets.size));
    const out: typeof items = [];
    for (const arr of buckets.values()) {
      out.push(...shuffle(arr).slice(0, perBucket));
    }
    return out.slice(0, dto.size);
  }

  // ---- Exceptions ----

  async listExceptions(tenantId: string, snapshotId?: string) {
    return (this.prisma as any).auditException.findMany({
      where: { tenantId, snapshotId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createException(tenantId: string, dto: CreateExceptionDto, actorId: string) {
    const e = await (this.prisma as any).auditException.create({
      data: {
        tenantId,
        snapshotId: dto.snapshotId,
        metricEventId: dto.metricEventId,
        severity: dto.severity,
        title: dto.title,
        description: dto.description,
        status: 'OPEN',
        raisedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AssuranceException',
      entityId: e.id,
      action: 'raise',
      after: e,
    });
    return e;
  }

  async respondException(tenantId: string, id: string, dto: RespondExceptionDto, actorId: string) {
    const before = await (this.prisma as any).auditException.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Exception not found');
    const updated = await (this.prisma as any).auditException.update({
      where: { id },
      data: {
        response: dto.response,
        responseAt: new Date(),
        respondedBy: actorId,
        status: dto.status ?? 'IN_REVIEW',
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AssuranceException',
      entityId: id,
      action: 'respond',
      before,
      after: updated,
    });
    return updated;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
