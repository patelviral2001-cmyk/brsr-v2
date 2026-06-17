import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { hashObject, sha256 } from '../common/utils/hash';

export interface AuditLogInput {
  tenantId: string | null;
  userId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await (this.prisma as any).auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          entity: input.entity,
          entityId: input.entityId,
          action: input.action,
          before: input.before ?? null,
          after: input.after ?? null,
          requestId: input.requestId,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: input.metadata ?? {},
        },
      });
    } catch (e) {
      this.logger.error(`Failed to write audit log: ${(e as Error).message}`);
    }
  }

  async query(filter: {
    tenantId: string;
    entity?: string;
    entityId?: string;
    userId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    take?: number;
    skip?: number;
  }) {
    return (this.prisma as any).auditLog.findMany({
      where: {
        tenantId: filter.tenantId,
        entity: filter.entity,
        entityId: filter.entityId,
        userId: filter.userId,
        action: filter.action,
        createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: filter.take ?? 100,
      skip: filter.skip ?? 0,
    });
  }

  /**
   * Streaming export — yields rows in batches. Caller assembles CSV/JSONL.
   */
  async *streamAll(tenantId: string, batchSize = 1000): AsyncGenerator<unknown[]> {
    let lastId: string | null = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows: unknown[] = await (this.prisma as any).auditLog.findMany({
        where: { tenantId, ...(lastId ? { id: { gt: lastId } } : {}) },
        orderBy: { id: 'asc' },
        take: batchSize,
      });
      if (rows.length === 0) break;
      yield rows;
      lastId = (rows[rows.length - 1] as { id: string }).id;
      if (rows.length < batchSize) break;
    }
  }

  /**
   * Nightly Merkle anchoring. Hashes the day's audit rows in id-order and
   * stores a single Merkle root in audit_anchor. Tamper evidence: any later
   * mutation of an anchored row will break the chain.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'audit-anchor' })
  async runDailyAnchor(): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);
    const until = new Date(since);
    until.setDate(until.getDate() + 1);

    this.logger.log(`Anchoring audit logs from ${since.toISOString()} to ${until.toISOString()}`);

    // Group anchors per tenant
    const tenantGroups: { tenantId: string }[] = await (this.prisma as any).auditLog.findMany({
      where: { createdAt: { gte: since, lt: until } },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    for (const { tenantId } of tenantGroups) {
      if (!tenantId) continue;
      const rows: { id: string; createdAt: Date; entity: string; entityId: string | null; action: string; before: unknown; after: unknown }[] =
        await (this.prisma as any).auditLog.findMany({
          where: { tenantId, createdAt: { gte: since, lt: until } },
          orderBy: { id: 'asc' },
        });

      if (rows.length === 0) continue;

      const leaves = rows.map((r) => hashObject({ id: r.id, entity: r.entity, entityId: r.entityId, action: r.action, before: r.before, after: r.after }));
      const root = merkleRoot(leaves);

      const prev: { merkleRoot: string } | null = await (this.prisma as any).auditAnchor.findFirst({
        where: { tenantId },
        orderBy: { day: 'desc' },
      });
      const chained = sha256((prev?.merkleRoot ?? '') + root);

      await (this.prisma as any).auditAnchor.create({
        data: {
          tenantId,
          day: since,
          rowCount: rows.length,
          merkleRoot: root,
          chainedRoot: chained,
          firstAuditLogId: rows[0]!.id,
          lastAuditLogId: rows[rows.length - 1]!.id,
        },
      });
    }
  }
}

function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256('');
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i] as string;
      const r = (i + 1 < level.length ? level[i + 1] : level[i]) as string;
      next.push(sha256(l + r));
    }
    level = next;
  }
  return level[0] as string;
}
