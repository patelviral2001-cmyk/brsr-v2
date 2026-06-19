import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogInput {
  tenantId: string | null;
  userId?: string | null;
  entity: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  // Per-request dedup so the @Audit decorator + service-body call don't
  // produce twin rows. 5 s window. Distinct (real) clicks fire <409>s
  // upstream of the audit write.
  private readonly recentKeys = new Map<string, number>();
  private static readonly DEDUPE_TTL_MS = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    if (!input.tenantId) return;
    try {
      const key = `${input.tenantId}|${input.entity}|${input.entityId ?? ''}|${input.action}`;
      this.purge();
      if (this.recentKeys.has(key)) return;
      this.recentKeys.set(key, Date.now() + AuditTrailService.DEDUPE_TTL_MS);

      await this.prisma.auditTrail.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.userId ?? null,
          action: input.action.toUpperCase(),
          entityType: input.entity,
          entityId: input.entityId ?? null,
          diff: {
            before: input.before ?? null,
            after: input.after ?? null,
            metadata: input.metadata ?? {},
          } as object,
          ipAddress: input.ip,
          userAgent: input.userAgent,
          requestId: input.requestId,
        },
      });
    } catch (e) {
      this.logger.warn(`audit-trail write failed: ${(e as Error).message}`);
    }
  }

  async query(filter: {
    tenantId: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(Math.max(1, filter.take ?? 100), 500);
    const skip = Math.max(0, filter.skip ?? 0);
    return this.prisma.auditTrail.findMany({
      where: {
        tenantId: filter.tenantId,
        entityType: filter.entityType,
        entityId: filter.entityId,
        actorUserId: filter.userId,
        action: filter.action?.toUpperCase(),
        createdAt: filter.from || filter.to
          ? { gte: filter.from, lte: filter.to }
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  private purge() {
    const now = Date.now();
    for (const [k, exp] of this.recentKeys) {
      if (exp < now) this.recentKeys.delete(k);
    }
  }
}
