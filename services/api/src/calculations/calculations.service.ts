import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
    return (this.prisma as any).formula.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
        frameworks: framework ? { has: framework } : undefined,
        deletedAt: null,
      },
      orderBy: [{ outputKey: 'asc' }, { version: 'desc' }],
    });
  }

  async createFormula(tenantId: string, dto: CreateFormulaDto, actorId: string) {
    // Validate CEL syntax up-front
    try {
      CelEvaluator.validate(dto.expression);
    } catch (e) {
      throw new BadRequestException(`Invalid CEL expression: ${(e as Error).message}`);
    }

    // Unit sanity: registry must exist + match unit
    const reg = await (this.prisma as any).metricRegistry.findFirst({
      where: { canonicalKey: dto.outputKey },
    });
    if (reg && reg.unit && reg.unit !== dto.unit) {
      throw new BadRequestException(
        `Output unit ${dto.unit} doesn't match registry unit ${reg.unit} for ${dto.outputKey}`,
      );
    }

    // Auto-increment version when not provided
    let version = dto.version;
    if (!version) {
      const latest = await (this.prisma as any).formula.findFirst({
        where: { tenantId, outputKey: dto.outputKey },
        orderBy: { version: 'desc' },
      });
      const n = latest ? parseInt(String(latest.version).replace(/[^0-9]/g, '') || '0', 10) + 1 : 1;
      version = `v${n}`;
    }

    const f = await (this.prisma as any).formula.create({
      data: {
        tenantId,
        outputKey: dto.outputKey,
        name: dto.name,
        expression: dto.expression,
        unit: dto.unit,
        version,
        frameworks: dto.frameworks ?? [],
        inputs: dto.inputs ?? [],
        description: dto.description,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Formula',
      entityId: f.id,
      action: 'create',
      after: f,
    });
    return f;
  }

  async startRun(tenantId: string, dto: CalcRunRequestDto, actorId: string, kind = 'GENERAL') {
    const run = await (this.prisma as any).calcRun.create({
      data: {
        tenantId,
        kind,
        status: 'QUEUED',
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        scopeNodeIds: dto.scopeNodeIds,
        frameworks: dto.frameworks ?? [],
        outputKeys: dto.outputKeys ?? [],
        startedBy: actorId,
      },
    });
    await this.queue.add('run', { runId: run.id, tenantId });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'CalcRun',
      entityId: run.id,
      action: 'queue',
      metadata: { kind },
    });
    return run;
  }

  async listRuns(tenantId: string, take = 50) {
    return (this.prisma as any).calcRun.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async getRun(tenantId: string, id: string) {
    const run = await (this.prisma as any).calcRun.findFirst({
      where: { id, tenantId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    if (!run) throw new NotFoundException('Run not found');
    // Build DAG visualization data
    const dag = {
      nodes: run.steps.map((s: { id: string; outputKey: string; status: string }) => ({
        id: s.id,
        label: s.outputKey,
        status: s.status,
      })),
      edges: run.steps.flatMap((s: { id: string; inputs: string[] }) =>
        (s.inputs ?? []).map((input) => ({ from: input, to: s.outputKey ?? s.id })),
      ),
    };
    return { ...run, dag };
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
    if (category < 1 || category > 15) throw new BadRequestException('category must be 1..15');
    return this.startRun(
      tenantId,
      { ...w, outputKeys: [`ghg_scope3_cat${category}`] },
      actorId,
      `SCOPE3_C${category}`,
    );
  }
}
