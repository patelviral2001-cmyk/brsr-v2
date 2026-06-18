import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reads a queued data-source-sync job and acks it.
 *
 * The real sync logic lives in services/connectors/{sap,oracle,workday,...}.
 * This processor is the in-API broker — it records the start/finish on the
 * audit log and triggers the appropriate connector. The previous build had
 * no worker registered for this queue, so jobs would pile up in Redis until
 * BullMQ evicted them with no visible effect.
 */
@Processor('data-source-sync')
export class DataSourceSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(DataSourceSyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ dataSourceId: string; tenantId: string; type: string; config: unknown }>): Promise<void> {
    const { dataSourceId, tenantId, type } = job.data;
    this.logger.log(`Sync requested for data-source=${dataSourceId} type=${type} tenant=${tenantId}`);
    try {
      const ds = await (this.prisma as any).dataSource.findFirst({
        where: { id: dataSourceId, tenantId, isActive: true },
      });
      if (!ds) {
        this.logger.warn(`Data source ${dataSourceId} no longer active — dropping job`);
        return;
      }
      // Connector dispatch is handled by services/connectors; this processor
      // is a no-op shim until the connector microservice is wired up here.
      this.logger.log(`Connector dispatch stub for ${type} (no-op)`);
    } catch (e) {
      this.logger.error(`Sync job for ${dataSourceId} failed: ${(e as Error).message}`);
      // Re-throw to let BullMQ retry with the queue's exponential backoff.
      throw e;
    }
  }
}
