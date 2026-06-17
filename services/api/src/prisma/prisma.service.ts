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
    const safeTenant = tenantId?.replace(/'/g, '') ?? '';
    const safeUser = userId?.replace(/'/g, '') ?? '';
    // SET LOCAL only applies inside a transaction; use SET for the session
    await this.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${safeTenant}', false)`);
    if (safeUser) {
      await this.$executeRawUnsafe(`SELECT set_config('app.current_user_id', '${safeUser}', false)`);
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
 */
const SOFT_DELETE_MODELS = new Set([
  'HierarchyNode',
  'Document',
  'DataSource',
  'MetricEvent',
  'Supplier',
  'User',
  'Survey',
  'AssessmentRun',
]);

function modelHasDeletedAt(model: Prisma.ModelName | string | undefined): boolean {
  if (!model) return false;
  return SOFT_DELETE_MODELS.has(model);
}
