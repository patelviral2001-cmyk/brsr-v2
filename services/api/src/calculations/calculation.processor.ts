import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CelContext, CelEvaluator, CelValue } from '../common/utils/cel-evaluator';

interface RunInput {
  runId: string;
  tenantId: string;
}

/**
 * Reads CalcRun, resolves applicable formulas, fetches input MetricEvents +
 * EmissionFactors, applies CEL, persists the output MetricEvent and a
 * CalcStep with lineage so assurance can walk it back.
 */
@Processor('calculations')
export class CalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(CalculationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<RunInput>): Promise<void> {
    const { runId, tenantId } = job.data;
    this.logger.log(`Starting calc run=${runId} tenant=${tenantId}`);

    const run = await (this.prisma as any).calcRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) {
      this.logger.warn(`Run ${runId} not found`);
      return;
    }
    await (this.prisma as any).calcRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      // 1. Resolve formulas
      const formulas: { id: string; outputKey: string; expression: string; unit: string; inputs: string[]; version: string }[] =
        await (this.prisma as any).formula.findMany({
          where: {
            OR: [{ tenantId: null }, { tenantId }],
            deletedAt: null,
            outputKey: run.outputKeys?.length ? { in: run.outputKeys } : undefined,
          },
        });

      // 2. Topologically sort by inputs
      const ordered = topoSortFormulas(formulas);

      // 3. Pre-load all relevant MetricEvents for the period + scope
      const inputs: { canonicalKey: string; value: Decimal; unit: string }[] = await (this.prisma as any).metricEvent.findMany({
        where: {
          tenantId,
          scopeNodeId: { in: run.scopeNodeIds },
          periodStart: { gte: run.periodStart },
          periodEnd: { lte: run.periodEnd },
          status: { in: ['APPROVED', 'LOCKED'] },
          deletedAt: null,
        },
        select: { canonicalKey: true, value: true, unit: true },
      });
      const metricCtx: Record<string, CelValue> = {};
      // Aggregate equal-keyed values by summing
      for (const m of inputs) {
        const k = m.canonicalKey;
        if (!metricCtx[k]) metricCtx[k] = { value: new Decimal(0), unit: m.unit };
        if (metricCtx[k]?.value instanceof Decimal) {
          metricCtx[k]!.value = (metricCtx[k]!.value as Decimal).plus(m.value);
        }
      }

      // 4. Load emission factors
      const factors: { code: string; value: Decimal; unit: string }[] = await (this.prisma as any).emissionFactor.findMany({
        where: { OR: [{ tenantId: null }, { tenantId }] },
        select: { code: true, value: true, unit: true },
      });
      const factorCtx: Record<string, CelValue> = {};
      for (const f of factors) factorCtx[f.code] = { value: f.value, unit: f.unit };

      // 5. Evaluate each formula in order
      let seq = 0;
      const periodDays = Math.max(
        1,
        Math.round((run.periodEnd.getTime() - run.periodStart.getTime()) / (24 * 3600 * 1000)),
      );

      for (const f of ordered) {
        const ctx: CelContext = { metrics: metricCtx, factors: factorCtx, periodDays };
        let result: CelValue;
        let status: 'SUCCESS' | 'ERROR' = 'SUCCESS';
        let error: string | null = null;
        try {
          result = CelEvaluator.evaluate(f.expression, ctx);
          if (!(result.value instanceof Decimal)) {
            throw new Error('Formula did not produce a numeric result');
          }
        } catch (e) {
          status = 'ERROR';
          error = (e as Error).message;
          result = { value: null };
        }

        await (this.prisma as any).calcStep.create({
          data: {
            tenantId,
            runId,
            sequence: seq++,
            formulaId: f.id,
            outputKey: f.outputKey,
            inputs: f.inputs,
            inputValuesSnapshot: snapshotInputs(f.inputs, metricCtx, factorCtx),
            status,
            error,
            value: result.value instanceof Decimal ? result.value : null,
            unit: f.unit,
          },
        });

        if (status === 'SUCCESS' && result.value instanceof Decimal) {
          // Persist as new MetricEvent (CALCULATED source) + add to local ctx so downstream formulas can use it
          const event = await (this.prisma as any).metricEvent.create({
            data: {
              tenantId,
              canonicalKey: f.outputKey,
              scopeNodeId: run.scopeNodeIds[0] as string, // aggregated; UI shows breakdown via CalcStep
              periodStart: run.periodStart,
              periodEnd: run.periodEnd,
              value: result.value,
              unit: f.unit,
              source: 'CALCULATED',
              calcRunId: runId,
              calcFormulaId: f.id,
              status: 'APPROVED', // computed values land approved
              metadata: { formulaVersion: f.version },
            },
          });
          metricCtx[f.outputKey] = { value: result.value, unit: f.unit };
          this.logger.debug(`Calculated ${f.outputKey}=${result.value.toString()} ${f.unit} (event=${event.id})`);
        } else {
          this.logger.warn(`Formula ${f.outputKey} failed: ${error}`);
        }
      }

      await (this.prisma as any).calcRun.update({
        where: { id: runId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (e) {
      this.logger.error(`Run ${runId} failed: ${(e as Error).message}`);
      await (this.prisma as any).calcRun.update({
        where: { id: runId },
        data: { status: 'FAILED', completedAt: new Date(), error: (e as Error).message },
      });
      throw e;
    }
  }
}

function snapshotInputs(
  inputs: string[],
  metrics: Record<string, CelValue>,
  factors: Record<string, CelValue>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of inputs ?? []) {
    const v = metrics[k] ?? factors[k];
    if (!v) continue;
    out[k] = { value: v.value instanceof Decimal ? v.value.toString() : v.value, unit: v.unit };
  }
  return out;
}

function topoSortFormulas<T extends { outputKey: string; inputs: string[] }>(formulas: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const f of formulas) byKey.set(f.outputKey, f);
  const visited = new Set<string>();
  const result: T[] = [];
  const visit = (f: T, stack: Set<string>): void => {
    if (visited.has(f.outputKey)) return;
    if (stack.has(f.outputKey)) throw new Error(`Formula cycle at ${f.outputKey}`);
    stack.add(f.outputKey);
    for (const input of f.inputs ?? []) {
      const dep = byKey.get(input);
      if (dep) visit(dep, stack);
    }
    stack.delete(f.outputKey);
    visited.add(f.outputKey);
    result.push(f);
  };
  for (const f of formulas) visit(f, new Set());
  return result;
}
