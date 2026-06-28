import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs after an extraction callback. Validates extracted units against the
 * canonical metric registry and flags anomalies for review.
 * Light-weight — heavy domain validations belong in calculations.
 */
@Processor('extraction-validation')
export class PostExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(PostExtractionProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ documentId: string; tenantId: string }>): Promise<void> {
    const { documentId, tenantId } = job.data;
    this.logger.log(`Validating extraction for document=${documentId}`);

    try {
      const fields: { id: string; canonicalKey: string; unitExtracted: string | null }[] =
        await (this.prisma as any).extractionField.findMany({
          where: { documentId, tenantId },
          select: { id: true, canonicalKey: true, unitExtracted: true },
        });

      for (const f of fields) {
        // Schema model is CanonicalMetric (PK = key), not metricRegistry.
        const registry = await (this.prisma as any).canonicalMetric.findUnique({
          where: { key: f.canonicalKey },
          select: { canonicalUnit: true, allowedUnits: true },
        });
        if (!registry) continue;
        const expectedUnit = registry.canonicalUnit as string | null;
        const allowed: string[] = registry.allowedUnits ?? [];
        if (
          expectedUnit &&
          f.unitExtracted &&
          expectedUnit !== f.unitExtracted &&
          !allowed.includes(f.unitExtracted)
        ) {
          await (this.prisma as any).extractionField.update({
            where: { id: f.id },
            data: {
              status: 'NEEDS_REVIEW',
              overrideReason: `Unit mismatch: expected ${expectedUnit}, got ${f.unitExtracted}`,
            },
          });
        }
      }
    } catch (e) {
      this.logger.error(`Post-extraction validation failed for ${documentId}: ${(e as Error).message}`);
      // Re-throw so BullMQ retries with exponential backoff.
      throw e;
    }
  }
}
