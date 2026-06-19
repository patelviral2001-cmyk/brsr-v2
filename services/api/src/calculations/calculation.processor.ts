import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CelContext, CelEvaluator, CelValue } from '../common/utils/cel-evaluator';

interface RunInput {
  runId: string;
  tenantId: string;
  kind?: string;
  outputKeys?: string[];
}

/**
 * Reads CalcRun, resolves applicable formulas from FrameworkMapping rows,
 * fetches input MetricEvents + EmissionFactors, applies CEL, and persists
 * one output MetricEvent per formula with lineage (sourceCalcRunId) so the
 * assurance walkthrough can walk it back.
 */
@Processor('calculations')
export class CalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(CalculationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<RunInput>): Promise<void> {
    const { runId, tenantId } = job.data;
    const requestedOutputKeys: string[] = job.data.outputKeys ?? [];
    this.logger.log(`Starting calc run=${runId} tenant=${tenantId}`);

    const run = await (this.prisma as any).calcRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) {
      this.logger.warn(`Run ${runId} not found`);
      return;
    }
    const startedAt = Date.now();

    try {
      // 1. Resolve formulas — schema has no `formula` model; formulas live as
      // FrameworkMapping rows with a `formula` JSON column.
      const mappings: { id: string; canonicalKeys: string[]; formula: any; version: string }[] =
        await (this.prisma as any).frameworkMapping.findMany({
          where: requestedOutputKeys.length
            ? { canonicalKeys: { hasSome: requestedOutputKeys } }
            : {},
          select: { id: true, canonicalKeys: true, formula: true, version: true },
        });

      const formulas: { id: string; outputKey: string; expression: string; unit: string; inputs: string[]; version: string }[] =
        mappings
          .filter((m) => m.formula && typeof m.formula === 'object')
          .map((m) => {
            const f = m.formula as { expression?: string; unit?: string; inputs?: string[] };
            return {
              id: m.id,
              outputKey: (m.canonicalKeys?.[0] ?? '') as string,
              expression: f.expression ?? '',
              unit: f.unit ?? '',
              inputs: f.inputs ?? [],
              version: m.version,
            };
          })
          .filter((f) => f.expression && f.outputKey);

      // 2a. Built-in Scope 2 (Location) fallback. The framework_mapping
      // table currently describes which canonical_keys feed which
      // disclosures — it does NOT carry full ESG calculation formulas.
      // When the caller asks for ghg_scope2_location and we have no
      // formula row defining it, derive it inline from
      // `purchased_electricity_kwh × India CEA grid factor` so the
      // calc_run produces a real, auditable number rather than 0.
      // Done BEFORE the topo-sort + requiredKeys collection so the input
      // metric_event query picks up `purchased_electricity_kwh`.
      const needScope2Loc =
        (requestedOutputKeys.includes('ghg_scope2_location') ||
          requestedOutputKeys.length === 0) &&
        !formulas.some((f) => f.outputKey === 'ghg_scope2_location');
      if (needScope2Loc) {
        formulas.push({
          id: 'builtin:scope2_location_from_electricity',
          outputKey: 'ghg_scope2_location',
          // India CEA v18 grid factor (FY23-24): 0.716 kgCO2e/kWh
          // → 7.16e-4 tCO2e/kWh.
          expression: 'purchased_electricity_kwh * 0.000716',
          unit: 'tCO2e',
          inputs: ['purchased_electricity_kwh'],
          version: 'builtin-v1',
        });
      }

      // 2a-bis. Built-in Scope 1 stationary-combustion fallback (diesel).
      // Same rationale as the Scope 2 builtin above — until framework_mapping
      // grows a real Scope 1 stationary formula, derive the value inline so
      // the calc_run returns a real number rather than 0.
      //
      // Factor derivation: DEFRA stationary-combustion diesel emission
      // factor is 2.6878 kgCO2e/litre. Customer metric is captured per kg
      // of diesel. Diesel density ≈ 0.832 kg/L, so 1 kg ≈ 1.2019 L, which
      // gives 2.6878 × 1.2019 ≈ 3.231 kgCO2e/kg → 3.231e-3 tCO2e/kg.
      const needScope1Stationary =
        (requestedOutputKeys.includes('ghg_scope1_stationary') ||
          requestedOutputKeys.includes('ghg_scope1_total') ||
          requestedOutputKeys.length === 0) &&
        !formulas.some(
          (f) =>
            f.outputKey === 'ghg_scope1_stationary' ||
            f.outputKey === 'ghg_scope1_total',
        );
      if (needScope1Stationary) {
        formulas.push({
          id: 'builtin:scope1_stationary_from_diesel_kg',
          outputKey: 'ghg_scope1_stationary',
          expression: 'stationary_combustion_diesel_kg * 0.003231',
          unit: 'tCO2e',
          inputs: ['stationary_combustion_diesel_kg'],
          version: 'builtin-v1',
        });
      }

      // 2b. Topologically sort by inputs
      const ordered = topoSortFormulas(formulas);

      // 3. Pre-load all relevant MetricEvents for the period + scope.
      // Restrict the canonicalKey set to inputs actually required by the
      // resolved formulas to avoid pulling millions of rows.
      const requiredKeys = new Set<string>();
      for (const f of formulas) for (const k of f.inputs ?? []) requiredKeys.add(k);
      const inputs: { canonicalKey: string; value: Decimal; unit: string }[] = await (this.prisma as any).metricEvent.findMany({
        where: {
          tenantId,
          canonicalKey: requiredKeys.size > 0 ? { in: Array.from(requiredKeys) } : undefined,
          scopeNodeId: { in: run.scopeNodeIds },
          periodStart: { gte: run.periodStart },
          periodEnd: { lte: run.periodEnd },
          status: { in: ['APPROVED', 'LOCKED'] },
        },
        select: { canonicalKey: true, value: true, unit: true },
      });
      const metricCtx: Record<string, CelValue> = {};
      // Aggregate equal-keyed values by summing.
      // CRITICAL: refuse to mix units silently — kWh + MWh would corrupt totals.
      for (const m of inputs) {
        const k = m.canonicalKey;
        if (!metricCtx[k]) {
          metricCtx[k] = { value: new Decimal(0), unit: m.unit };
        } else if (metricCtx[k]!.unit !== m.unit) {
          throw new Error(
            `Unit mismatch for ${k}: ${metricCtx[k]!.unit} vs ${m.unit}. Normalise at ingest.`,
          );
        }
        metricCtx[k]!.value = (metricCtx[k]!.value as Decimal).plus(m.value);
      }

      // 4. Load emission factors. Schema field is `activityType` (not `code`).
      const factors: { activityType: string; value: Decimal; unit: string }[] = await (this.prisma as any).emissionFactor.findMany({
        where: { OR: [{ tenantId: null }, { tenantId }] },
        select: { activityType: true, value: true, unit: true },
      });
      const factorCtx: Record<string, CelValue> = {};
      for (const f of factors) factorCtx[f.activityType] = { value: f.value, unit: f.unit };

      // 5. Evaluate each formula in order
      const periodDays = Math.max(
        1,
        Math.round((run.periodEnd.getTime() - run.periodStart.getTime()) / (24 * 3600 * 1000)),
      );

      let lastSuccessful: { outputKey: string; value: Decimal; unit: string; version: string; formulaId: string } | null = null;
      const emittedEventIds: string[] = [];
      const usedInputKeys = new Set<string>();
      const usedFactorKeys = new Set<string>();

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

        if (status === 'SUCCESS' && result.value instanceof Decimal) {
          // Persist the calculated value as a new MetricEvent. Schema fields:
          // sourceType (enum), sourceCalcRunId, dimensions (json), no
          // calcFormulaId column — record version in dimensions.
          const event = await (this.prisma as any).metricEvent.create({
            data: {
              tenantId,
              canonicalKey: f.outputKey,
              scopeNodeId: run.scopeNodeIds[0] as string,
              periodStart: run.periodStart,
              periodEnd: run.periodEnd,
              value: result.value,
              unit: f.unit,
              sourceType: 'CALCULATION',
              sourceCalcRunId: runId,
              status: 'APPROVED',
              dimensions: { formulaVersion: f.version, formulaId: f.id },
              submittedBy: run.computedBy,
            },
          });
          metricCtx[f.outputKey] = { value: result.value, unit: f.unit };
          emittedEventIds.push(event.id);
          for (const k of f.inputs ?? []) {
            if (metricCtx[k]) usedInputKeys.add(k);
            else if (factorCtx[k]) usedFactorKeys.add(k);
          }
          lastSuccessful = { outputKey: f.outputKey, value: result.value, unit: f.unit, version: f.version, formulaId: f.id };
          this.logger.debug(`Calculated ${f.outputKey}=${result.value.toString()} ${f.unit} (event=${event.id})`);
        } else {
          this.logger.warn(`Formula ${f.outputKey} failed: ${error}`);
        }
      }

      // 6. Finalise the CalcRun row with the last successful output (mirrors
      // the schema CalcRun fields). If nothing succeeded, mark the run as
      // empty rather than crash.
      await (this.prisma as any).calcRun.update({
        where: { id: runId },
        data: {
          formulaVersionId: lastSuccessful?.formulaId ?? 'none',
          outputCanonicalKey: lastSuccessful?.outputKey ?? run.outputCanonicalKey ?? '',
          outputValue: lastSuccessful?.value ?? 0,
          outputUnit: lastSuccessful?.unit ?? '',
          inputMetricIds: Array.from(usedInputKeys),
          factorIds: Array.from(usedFactorKeys),
          durationMs: Date.now() - startedAt,
        },
      });
      this.logger.log(
        `Calc run ${runId} completed in ${Date.now() - startedAt}ms (${emittedEventIds.length} outputs)`,
      );
    } catch (e) {
      this.logger.error(`Run ${runId} failed: ${(e as Error).message}`);
      // Don't crash the run row — record the duration; throw so BullMQ retries.
      try {
        await (this.prisma as any).calcRun.update({
          where: { id: runId },
          data: { durationMs: Date.now() - startedAt },
        });
      } catch {
        /* swallow */
      }
      throw e;
    }
  }
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
