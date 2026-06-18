import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    // Lock data: snapshot APPROVED/LOCKED events for fy/scope. Schema has no
    // AssuranceSnapshotItem; we persist member ids on the snapshot's scope JSON.
    const events = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        scopeNodeId: { in: dto.scopeNodeIds },
        status: { in: ['APPROVED', 'LOCKED'] },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        canonicalKey: true,
        value: true,
        unit: true,
        sourceExtractionId: true,
        sourceCalcRunId: true,
      },
    });

    const snapshot = await (this.prisma as any).assuranceSnapshot.create({
      data: {
        tenantId,
        fy: dto.fy,
        framework: dto.framework as any,
        scope: {
          scopeNodeIds: dto.scopeNodeIds,
          metricEventIds: events.map((e: any) => e.id),
          note: dto.note ?? null,
        },
        auditorOrgName: (dto as { auditorOrgName?: string }).auditorOrgName ?? 'TBD',
        auditorUserIds: (dto as { auditorUserIds?: string[] }).auditorUserIds ?? [],
        metricCount: events.length,
        evidenceCount: events.filter((e: any) => !!e.sourceExtractionId).length,
        hashAnchor: hashObject(
          events.map((e: any) => ({ id: e.id, value: e.value?.toString?.(), unit: e.unit })),
        ),
        reportS3: '',
        status: 'ACTIVE' as any,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AssuranceSnapshot',
      entityId: snapshot.id,
      action: 'CREATE',
      after: snapshot,
    });
    return snapshot;
  }

  async list(tenantId: string) {
    return (this.prisma as any).assuranceSnapshot.findMany({
      where: { tenantId },
      orderBy: { snapshotAt: 'desc' },
    });
  }

  /**
   * Full lineage trace for a metric key inside a snapshot.
   *
   *   Document → ExtractionField → MetricEvent → CalcRun → BRSR section
   */
  async walkthrough(tenantId: string, snapshotId: string, metricKey: string) {
    const snap = await (this.prisma as any).assuranceSnapshot.findFirst({
      where: { id: snapshotId, tenantId },
    });
    if (!snap) throw new NotFoundException('Snapshot not found');

    const memberIds: string[] = (snap.scope as { metricEventIds?: string[] })?.metricEventIds ?? [];
    const events = await (this.prisma as any).metricEvent.findMany({
      where: {
        id: { in: memberIds },
        tenantId,
        canonicalKey: metricKey,
      },
    });
    // Pull extraction fields + their documents in a single batched query.
    const extractionIds = Array.from(
      new Set(events.map((e: any) => e.sourceExtractionId).filter((x: any) => !!x)),
    );
    const fields = extractionIds.length
      ? await (this.prisma as any).extractionField.findMany({
          where: { id: { in: extractionIds }, tenantId },
          include: { document: true },
        })
      : [];
    const calcRunIds = Array.from(
      new Set(events.map((e: any) => e.sourceCalcRunId).filter((x: any) => !!x)),
    );
    const calcRuns = calcRunIds.length
      ? await (this.prisma as any).calcRun.findMany({
          where: { id: { in: calcRunIds }, tenantId },
        })
      : [];

    const sectionMappings = await (this.prisma as any).frameworkMapping.findMany({
      where: {
        framework: snap.framework as any,
        canonicalKeys: { has: metricKey },
      },
    });

    return {
      snapshotId,
      metricKey,
      framework: snap.framework,
      sections: sectionMappings.map(
        (m: { frameworkCode: string; frameworkSection: string | null }) => ({
          sectionId: m.frameworkSection ?? m.frameworkCode,
          label: m.frameworkCode,
        }),
      ),
      lineage: events.map((ev: any) => ({
        metricEvent: ev,
        extractionField: fields.find((f: any) => f.id === ev.sourceExtractionId) ?? null,
        document:
          fields.find((f: any) => f.id === ev.sourceExtractionId)?.document ?? null,
        calcRun: calcRuns.find((c: any) => c.id === ev.sourceCalcRunId) ?? null,
      })),
    };
  }

  /** Pseudo-random / stratified sample of snapshot items. */
  async sample(tenantId: string, snapshotId: string, dto: SampleSnapshotDto) {
    const snap = await (this.prisma as any).assuranceSnapshot.findFirst({
      where: { id: snapshotId, tenantId },
    });
    if (!snap) throw new NotFoundException('Snapshot not found');

    const memberIds: string[] = (snap.scope as { metricEventIds?: string[] })?.metricEventIds ?? [];
    if (memberIds.length === 0) return [];

    const items: { id: string; canonicalKey: string; value: unknown }[] = await (this.prisma as any).metricEvent.findMany({
      where: {
        id: { in: memberIds },
        tenantId,
        ...(dto.canonicalKey ? { canonicalKey: dto.canonicalKey } : {}),
      },
      select: { id: true, canonicalKey: true, value: true },
    });
    if (items.length === 0) return [];
    const size = Math.min(Math.max(1, dto.size), items.length);

    if (dto.method === SamplingMethod.RANDOM) {
      return shuffle(items).slice(0, size);
    }
    if (dto.method === SamplingMethod.HIGH_VALUE) {
      const sorted = items.slice().sort((a, b) => Number(b.value) - Number(a.value));
      return sorted.slice(0, size);
    }
    // STRATIFIED — equal-allocation across distinct canonicalKey buckets.
    const buckets = new Map<string, typeof items>();
    for (const it of items) {
      const arr = buckets.get(it.canonicalKey) ?? [];
      arr.push(it);
      buckets.set(it.canonicalKey, arr);
    }
    const perBucket = Math.max(1, Math.floor(size / buckets.size));
    const out: typeof items = [];
    for (const arr of buckets.values()) {
      out.push(...shuffle(arr).slice(0, perBucket));
    }
    return out.slice(0, size);
  }

  // ---- Exceptions ----

  async listExceptions(tenantId: string, snapshotId?: string) {
    // Schema model is AuditException, tied to snapshot.tenantId via relation.
    return (this.prisma as any).auditException.findMany({
      where: {
        snapshot: { tenantId },
        ...(snapshotId ? { snapshotId } : {}),
      },
      orderBy: { raisedAt: 'desc' },
    });
  }

  async createException(tenantId: string, dto: CreateExceptionDto, actorId: string) {
    // Schema AuditException: snapshotId, metricEventId, severity (enum),
    // description, status (OPEN default), raisedBy. Severity must be LOW|MEDIUM|HIGH.
    if (!dto.snapshotId) throw new BadRequestException('snapshotId is required');
    const snap = await (this.prisma as any).assuranceSnapshot.findFirst({
      where: { id: dto.snapshotId, tenantId },
      select: { id: true },
    });
    if (!snap) throw new NotFoundException('Snapshot not found in this tenant');

    const validSev = new Set(['LOW', 'MEDIUM', 'HIGH']);
    const severity = dto.severity?.toUpperCase();
    if (!severity || !validSev.has(severity)) {
      throw new BadRequestException('severity must be LOW|MEDIUM|HIGH');
    }
    const e = await (this.prisma as any).auditException.create({
      data: {
        snapshotId: dto.snapshotId,
        metricEventId: dto.metricEventId ?? null,
        severity: severity as any,
        description: dto.description ?? dto.title ?? '',
        status: 'OPEN' as any,
        raisedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AuditException',
      entityId: e.id,
      action: 'CREATE',
      after: e,
    });
    return e;
  }

  async respondException(tenantId: string, id: string, dto: RespondExceptionDto, actorId: string) {
    // Schema AuditException has no `response`/`responseAt`/`respondedBy`/`status=IN_REVIEW`
    // columns — only managementResponse, status (OPEN|RESPONDED|CLOSED), closedAt.
    const before = await (this.prisma as any).auditException.findFirst({
      where: { id, snapshot: { tenantId } },
    });
    if (!before) throw new NotFoundException('Exception not found');

    // Default to RESPONDED if caller didn't pick a state. IN_REVIEW is the
    // intermediate state while audit team drafts a reply; CLOSED is terminal
    // and stamps closedAt.
    const status = dto.status ?? 'RESPONDED';
    // Block illegal transitions: a CLOSED exception cannot be re-opened.
    if (before.status === 'CLOSED' && status !== 'CLOSED') {
      throw new BadRequestException('Cannot reopen a CLOSED exception');
    }
    const updated = await (this.prisma as any).auditException.update({
      where: { id },
      data: {
        managementResponse: dto.response ?? null,
        status: status as any,
        closedAt: status === 'CLOSED' ? new Date() : before.closedAt,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AuditException',
      entityId: id,
      action: 'UPDATE',
      before,
      after: updated,
      metadata: { respondedBy: actorId },
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
