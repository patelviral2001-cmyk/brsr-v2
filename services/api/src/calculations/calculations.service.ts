import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CelEvaluator } from '../common/utils/cel-evaluator';
import { AuditService } from '../audit/audit.service';
import { CalcRunRequestDto, CreateFormulaDto, ScopeWindowDto } from './dto/calculations.dto';

@Injectable()
export class CalculationsService {
  private readonly logger = new Logger(CalculationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('calculations') private readonly queue: Queue,
  ) {}

  async listFormulas(tenantId: string, framework?: string) {
    // Schema has no `formula` model. Framework formulas live as
    // FrameworkMapping rows with a `formula` JSON column.
    return (this.prisma as any).frameworkMapping.findMany({
      where: framework ? { framework: framework as any } : undefined,
      orderBy: [{ frameworkCode: 'asc' }, { version: 'desc' }],
    });
  }

  async createFormula(tenantId: string, dto: CreateFormulaDto, actorId: string) {
    // Validate CEL syntax up-front so a bad expression doesn't reach BullMQ.
    // SECURITY: the CEL evaluator MUST reject any non-whitelisted identifier.
    try {
      CelEvaluator.validate(dto.expression);
    } catch (e) {
      throw new BadRequestException(`Invalid CEL expression: ${(e as Error).message}`);
    }

    // Unit sanity: canonical metric must exist + unit must be canonical or
    // explicitly allowed.
    const reg = await (this.prisma as any).canonicalMetric.findUnique({
      where: { key: dto.outputKey },
    });
    if (!reg) {
      throw new BadRequestException(`Output canonical metric does not exist: ${dto.outputKey}`);
    }
    const allowed = (reg.allowedUnits ?? []) as string[];
    if (reg.canonicalUnit && reg.canonicalUnit !== dto.unit && !allowed.includes(dto.unit)) {
      throw new BadRequestException(
        `Output unit ${dto.unit} doesn't match canonical unit ${reg.canonicalUnit} for ${dto.outputKey}`,
      );
    }

    const framework = (dto.frameworks?.[0] ?? 'BRSR') as string;
    const version = dto.version ?? 'v1';
    const f = await (this.prisma as any).frameworkMapping.create({
      data: {
        framework: framework as any,
        frameworkCode: dto.name,
        frameworkSection: dto.description ?? null,
        version,
        canonicalKeys: [dto.outputKey, ...(dto.inputs ?? [])],
        formula: { expression: dto.expression, unit: dto.unit, inputs: dto.inputs ?? [] },
        validFrom: new Date(),
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'FrameworkMapping',
      entityId: f.id,
      action: 'CREATE',
      after: f,
    });
    return f;
  }

  async startRun(
    tenantId: string,
    dto: CalcRunRequestDto & { idempotencyKey?: string },
    actorId: string,
    kind = 'GENERAL',
  ) {
    if (new Date(dto.periodStart) > new Date(dto.periodEnd)) {
      throw new BadRequestException('periodStart must be <= periodEnd');
    }
    // Validate scope nodes belong to this tenant.
    const ownedCount = await (this.prisma as any).entityNode.count({
      where: { id: { in: dto.scopeNodeIds }, tenantId },
    });
    if (ownedCount !== dto.scopeNodeIds.length) {
      throw new BadRequestException('One or more scopeNodeIds do not belong to this tenant');
    }

    // Schema CalcRun fields: formulaVersionId, outputCanonicalKey, outputValue,
    // outputUnit, inputMetricIds, factorIds, scopeNodeIds, periodStart,
    // periodEnd, reproducibleSeed, computedBy, durationMs.
    const run = await (this.prisma as any).calcRun.create({
      data: {
        tenantId,
        formulaVersionId: 'pending',
        outputCanonicalKey: dto.outputKeys?.[0] ?? '',
        outputValue: 0,
        outputUnit: '',
        inputMetricIds: [],
        factorIds: [],
        scopeNodeIds: dto.scopeNodeIds,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        reproducibleSeed: randomBytes(16).toString('hex'),
        computedBy: actorId,
        durationMs: 0,
      },
    });
    await this.queue.add(
      'run',
      { runId: run.id, tenantId, kind, outputKeys: dto.outputKeys ?? [] },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // Idempotency-Key support: identical key short-circuits duplicate
        // queue insertions if the caller retries the request.
        jobId: dto.idempotencyKey
          ? `calc-${tenantId}-${dto.idempotencyKey}`
          : undefined,
      },
    );
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'CalcRun',
      entityId: run.id,
      action: 'CREATE',
      metadata: { kind, queued: true },
    });
    return run;
  }

  async listRuns(tenantId: string, take = 50) {
    const safeTake = Math.min(Math.max(1, take), 200);
    return (this.prisma as any).calcRun.findMany({
      where: { tenantId },
      orderBy: { computedAt: 'desc' },
      take: safeTake,
    });
  }

  async getRun(tenantId: string, id: string) {
    const run = await (this.prisma as any).calcRun.findFirst({
      where: { id, tenantId },
    });
    if (!run) throw new NotFoundException('Run not found');
    // Schema has no CalcStep model — derive the DAG from emitted MetricEvents.
    const emitted = await (this.prisma as any).metricEvent.findMany({
      where: { tenantId, sourceCalcRunId: id },
      select: { id: true, canonicalKey: true, value: true, unit: true, status: true },
    });
    const dag = {
      nodes: emitted.map((m: { id: string; canonicalKey: string; status: string }) => ({
        id: m.id,
        label: m.canonicalKey,
        status: m.status,
      })),
      edges: (run.inputMetricIds ?? []).map((input: string) => ({
        from: input,
        to: run.outputCanonicalKey,
      })),
    };
    return { ...run, dag, outputs: emitted };
  }

  async runScope1(tenantId: string, w: ScopeWindowDto, actorId: string) {
    return this.startRun(
      tenantId,
      { ...w, outputKeys: ['ghg_scope1_total', 'ghg_scope1_stationary', 'ghg_scope1_mobile', 'ghg_scope1_process', 'ghg_scope1_fugitive'] },
      actorId,
      'SCOPE1',
    );
  }

  async runScope2(tenantId: string, w: ScopeWindowDto, actorId: string) {
    return this.startRun(
      tenantId,
      { ...w, outputKeys: ['ghg_scope2_location', 'ghg_scope2_market'] },
      actorId,
      'SCOPE2',
    );
  }

  async runScope3Category(tenantId: string, w: ScopeWindowDto, category: number, actorId: string) {
    if (!Number.isInteger(category) || category < 1 || category > 15) {
      throw new BadRequestException('category must be an integer in 1..15');
    }
    return this.startRun(
      tenantId,
      { ...w, outputKeys: [`ghg_scope3_cat${category}`] },
      actorId,
      `SCOPE3_C${category}`,
    );
  }
}
