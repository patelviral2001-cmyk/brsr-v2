import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * PrismaService - wraps PrismaClient with NestJS lifecycle, soft-delete
 * extension, and a helper to set the per-request Postgres session variable
 * `app.current_tenant_id` used by Row Level Security policies.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  /**
   * Sets the postgres session variable so that RLS policies can scope queries
   * to the current tenant. Must be called at the start of every authenticated
   * request — TenantInterceptor handles that.
   */
  async setTenantContext(tenantId: string | null, userId?: string | null): Promise<void> {
    // Hardened: enforce strict id charset and use parameterised query to make
    // SQL injection impossible even if the JWT decoder is bypassed somehow.
    const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
    const t = tenantId && SAFE_ID.test(tenantId) ? tenantId : '';
    await this.$executeRaw`SELECT set_config('app.current_tenant_id', ${t}, false)`;
    if (userId && SAFE_ID.test(userId)) {
      await this.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, false)`;
    }
  }

  /**
   * Soft-delete extension. Models that have a `deletedAt` column will be
   * filtered automatically and `delete` will translate to update.
   */
  withSoftDelete() {
    return this.$extends({
      query: {
        $allModels: {
          async findMany({ args, query, model }) {
            if (modelHasDeletedAt(model)) {
              args.where = { ...(args.where as object), deletedAt: null };
            }
            return query(args);
          },
          async findFirst({ args, query, model }) {
            if (modelHasDeletedAt(model)) {
              args.where = { ...(args.where as object), deletedAt: null };
            }
            return query(args);
          },
          async delete({ args, model }) {
            if (modelHasDeletedAt(model)) {
              return (this as any)[model].update({
                where: args.where,
                data: { deletedAt: new Date() },
              });
            }
            return (this as any)[model].delete(args);
          },
        },
      },
    });
  }
}

/**
 * Models that participate in soft-delete. Keep this list curated to avoid
 * silently swallowing rows on ad-hoc tables that don't have the column.
 *
 * NOTE: Only Tenant has a `deletedAt` column in the current schema. Other
 * models historically listed here (User, Document, DataSource, MetricEvent,
 * Supplier, etc.) DO NOT have `deletedAt` and would crash Prisma at runtime
 * if we tried to inject the filter. Verified against schema.prisma 2026-06.
 */
const SOFT_DELETE_MODELS = new Set([
  'Tenant',
]);

function modelHasDeletedAt(model: Prisma.ModelName | string | undefined): boolean {
  if (!model) return false;
  return SOFT_DELETE_MODELS.has(model);
}
