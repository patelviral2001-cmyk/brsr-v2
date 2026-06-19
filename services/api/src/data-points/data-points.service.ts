import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DataPointsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, params: {
    siteId?: string; kpiCode?: string; topicCode?: string; fy?: string;
    status?: string; take?: number; skip?: number;
  }) {
    const take = Math.min(Math.max(1, params.take ?? 100), 500);
    const where: any = { tenantId, deletedAt: null };
    if (params.siteId) where.siteId = params.siteId;
    if (params.fy) where.fy = params.fy;
    if (params.status) where.status = params.status;
    if (params.kpiCode) where.kpi = { code: params.kpiCode };
    if (params.topicCode) where.kpi = { ...(where.kpi ?? {}), topic: { code: params.topicCode } };
    return this.prisma.dataPoint.findMany({
      where,
      include: {
        kpi: { include: { topic: true } },
        site: { select: { id: true, name: true, externalCode: true } },
        evidence: { select: { id: true, originalName: true, status: true } },
      },
      orderBy: [{ periodStart: 'desc' }, { submittedAt: 'desc' }],
      take,
      skip: params.skip ?? 0,
    });
  }

  async findOne(tenantId: string, id: string) {
    const dp = await this.prisma.dataPoint.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        kpi: { include: { topic: true, disclosures: { include: { standard: true } } } },
        site: true,
        reportingEntity: true,
        evidence: true,
      },
    });
    if (!dp) throw new NotFoundException('Data Point not found');
    return dp;
  }

  /**
   * Audit trail walk for a single Data Point.
   * Hop 1: data_point row
   * Hop 2: evidence row (if EXTRACTED source)
   * Hop 3: extraction result row
   * Hop 4: audit_trail entries for this DataPoint
   */
  async lineage(tenantId: string, id: string) {
    const dp = await this.findOne(tenantId, id);
    const evidence = dp.evidenceId
      ? await this.prisma.evidence.findFirst({ where: { id: dp.evidenceId, tenantId }, include: {
          extractions: { orderBy: { createdAt: 'desc' }, take: 1 },
        }})
      : null;

    const trail = await this.prisma.auditTrail.findMany({
      where: { tenantId, OR: [
        { entityType: 'DataPoint', entityId: id },
        ...(evidence ? [{ entityType: 'Evidence', entityId: evidence.id }] : []),
      ]},
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      dataPoint: dp,
      evidence: evidence ? {
        ...evidence,
        sizeBytes: typeof evidence.sizeBytes === 'bigint' ? Number(evidence.sizeBytes) : evidence.sizeBytes,
      } : null,
      extraction: evidence?.extractions?.[0] ?? null,
      auditTrail: trail,
    };
  }
}
