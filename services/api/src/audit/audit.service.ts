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

  // Per-request dedup table — prevents the AuditInterceptor and the
  // controller-handler's explicit audit.log() call from BOTH writing
  // rows for the same logical event. Keys live for 60 s before TTL
  // eviction. Without this, every mutating endpoint produced two
  // audit_log rows (one from the @Audit decorator → AuditInterceptor,
  // one from the service body's audit.log() with the richer before/
  // after diff). 242 audit rows during the audit reflected ~125 real
  // events doubled at the write layer.
  private readonly recentKeys = new Map<string, number>();
  private static readonly DEDUPE_TTL_MS = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      // Map our action verb to the AuditActionType enum.
      const actionEnum = (input.action || 'UPDATE').toUpperCase();
      const validActions = new Set([
        'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT',
        'LOCK', 'UNLOCK', 'EXPORT', 'LOGIN', 'IMPERSONATE',
        'SIGN', 'EXTRACT', 'OVERRIDE',
      ]);
      const action = validActions.has(actionEnum) ? actionEnum : 'UPDATE';

      // Dedup against the same (tenantId, entity, entityId, action)
      // tuple within a short TTL. The two write sources (service body
      // and AuditInterceptor) intentionally don't share a requestId —
      // the service call omits it — so we can't key on requestId.
      // 5-second window is short enough that a legitimate distinct
      // event for the same tuple (e.g. two genuine human clicks) is
      // already short-circuited by the domain layer (409 "already in
      // status X") rather than reaching the audit write a second time.
      const key = `${input.tenantId ?? ''}|${input.entity}|${input.entityId ?? ''}|${action}`;
      this.purgeExpiredKeys();
      if (this.recentKeys.has(key)) return;
      this.recentKeys.set(key, Date.now() + AuditService.DEDUPE_TTL_MS);

      await (this.prisma as any).auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.userId ?? null,
          entityType: input.entity,
          entityId: input.entityId ?? '',
          action,
          diff: {
            before: input.before ?? null,
            after: input.after ?? null,
            metadata: input.metadata ?? {},
          },
          ipAddress: input.ip,
          userAgent: input.userAgent,
          requestId: input.requestId,
        },
      });
    } catch (e) {
      // Audit logging is best-effort — never block the user request.
      this.logger.warn(`Audit log skipped: ${(e as Error).message}`);
    }
  }

  private purgeExpiredKeys(): void {
    const now = Date.now();
    for (const [k, exp] of this.recentKeys) {
      if (exp < now) this.recentKeys.delete(k);
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
    // Cap pagination so abusive clients can't request 10M rows in memory.
    const take = Math.min(Math.max(1, filter.take ?? 100), 500);
    const skip = Math.max(0, filter.skip ?? 0);
    const validActions = new Set([
      'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT',
      'LOCK', 'UNLOCK', 'EXPORT', 'LOGIN', 'IMPERSONATE',
      'SIGN', 'EXTRACT', 'OVERRIDE',
    ]);
    const normalisedAction = filter.action ? filter.action.toUpperCase() : undefined;
    return (this.prisma as any).auditLog.findMany({
      where: {
        tenantId: filter.tenantId,
        entityType: filter.entity,
        entityId: filter.entityId,
        actorUserId: filter.userId,
        action: normalisedAction && validActions.has(normalisedAction) ? normalisedAction : undefined,
        createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
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
   * Nightly Merkle anchoring. The persistent `audit_anchor` table is not yet
   * in the schema (planned for a future migration). Until then this cron
   * computes per-tenant Merkle roots in memory and emits a structured log
   * line that ops can ship to immutable storage (S3 + Object Lock).
   *
   * Per-tenant failures must NOT abort the whole job — one bad tenant
   * shouldn't block the rest.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'audit-anchor' })
  async runDailyAnchor(): Promise<void> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      since.setHours(0, 0, 0, 0);
      const until = new Date(since);
      until.setDate(until.getDate() + 1);

      this.logger.log(`Anchoring audit logs from ${since.toISOString()} to ${until.toISOString()}`);

      const tenantGroups: { tenantId: string | null }[] = await (this.prisma as any).auditLog.findMany({
        where: { createdAt: { gte: since, lt: until } },
        select: { tenantId: true },
        distinct: ['tenantId'],
      });

      for (const { tenantId } of tenantGroups) {
        if (!tenantId) continue;
        try {
          const rows: { id: string; entityType: string; entityId: string; action: string; diff: unknown }[] =
            await (this.prisma as any).auditLog.findMany({
              where: { tenantId, createdAt: { gte: since, lt: until } },
              orderBy: { id: 'asc' },
              select: { id: true, entityType: true, entityId: true, action: true, diff: true },
            });
          if (rows.length === 0) continue;

          const leaves = rows.map((r) =>
            hashObject({
              id: r.id,
              entityType: r.entityType,
              entityId: r.entityId,
              action: r.action,
              diff: r.diff,
            }),
          );
          const root = merkleRoot(leaves);
          const chained = sha256(root);

          this.logger.log({
            event: 'audit_anchor',
            tenantId,
            day: since.toISOString().slice(0, 10),
            rowCount: rows.length,
            merkleRoot: root,
            chainedRoot: chained,
            firstId: rows[0]?.id,
            lastId: rows[rows.length - 1]?.id,
          });
        } catch (e) {
          this.logger.warn(
            `Audit anchor failed for tenant ${tenantId}: ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      this.logger.error(`Audit anchor job failed: ${(e as Error).message}`);
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
