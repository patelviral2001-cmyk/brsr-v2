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

    const fields: { id: string; fieldKey: string; unit: string | null; value: unknown }[] =
      await (this.prisma as any).extractionField.findMany({ where: { documentId, tenantId } });

    for (const f of fields) {
      const registry = await (this.prisma as any).metricRegistry.findFirst({
        where: { canonicalKey: f.fieldKey },
      });
      if (!registry) continue;
      if (registry.unit && f.unit && registry.unit !== f.unit) {
        await (this.prisma as any).extractionField.update({
          where: { id: f.id },
          data: { status: 'NEEDS_REVIEW', validationNotes: `Unit mismatch: expected ${registry.unit}, got ${f.unit}` },
        });
      }
    }
  }
}
