import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CalculationsService } from '../calculations/calculations.service';
import {
  CreateAbatementProjectDto,
  CreateCarbonCreditDto,
  CreateSbtiTargetDto,
  EmissionsQueryDto,
  Scope3RunDto,
  UpdateAbatementProjectDto,
  UpdateCarbonCreditDto,
  UpdateSbtiTargetDto,
} from './dto/carbon.dto';

@Injectable()
export class CarbonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: CalculationsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Emissions ----

  async emissions(tenantId: string, q: EmissionsQueryDto) {
    const scopeKeys: Record<number, string[]> = {
      1: ['ghg_scope1_total'],
      2: ['ghg_scope2_location', 'ghg_scope2_market'],
      3: Array.from({ length: 15 }, (_, i) => `ghg_scope3_cat${i + 1}`),
    };
    const keys = scopeKeys[q.scope] ?? [];
    const events: { canonicalKey: string; value: Decimal; unit: string; periodEnd: Date; scopeNodeId: string }[] =
      await (this.prisma as any).metricEvent.findMany({
        where: {
          tenantId,
          canonicalKey: { in: keys },
          scopeNodeId: q.scopeNodeIds && q.scopeNodeIds.length ? { in: q.scopeNodeIds } : undefined,
          periodStart: { gte: new Date(q.from) },
          periodEnd: { lte: new Date(q.to) },
          status: { in: ['APPROVED', 'LOCKED'] },
          
        },
      });
    const totalByKey: Record<string, string> = {};
    for (const e of events) {
      const prior = totalByKey[e.canonicalKey] ? new Decimal(totalByKey[e.canonicalKey] as string) : new Decimal(0);
      totalByKey[e.canonicalKey] = prior.plus(e.value).toString();
    }
    return { scope: q.scope, totalByKey, events };
  }

  // ---- Scope 3 ----

  async runAllScope3(tenantId: string, dto: Scope3RunDto, actorId: string) {
    const runs = [];
    for (let cat = 1; cat <= 15; cat++) {
      runs.push(await this.calc.runScope3Category(tenantId, dto, cat, actorId));
    }
    return { queued: runs.length, runIds: runs.map((r) => r.id) };
  }

  // ---- SBTi targets ----

  async listSbti(tenantId: string) {
    // Schema SbtiTarget has no createdAt column; order by id desc.
    return (this.prisma as any).sbtiTarget.findMany({ where: { tenantId }, orderBy: { id: 'desc' } });
  }

  /**
   * Maps the DTO (type/baselineYear/targetYear/reductionPercent/scopes[]) onto
   * the schema columns (scope (SbtiScope enum), baselineYear, baselineValue,
   * targetYear, targetReductionPct).
   */
  private toSbtiCreate(dto: CreateSbtiTargetDto) {
    // Map scopes[] -> schema SbtiScope enum. Choose the broadest covered scope.
    const scopes = (dto.scopes ?? []).map((s) => s.toUpperCase());
    let scope = 'S1_S2';
    if (scopes.includes('S3') || scopes.includes('S1_S2_S3') || scopes.includes('ALL')) scope = 'ALL';
    else if (scopes.length === 1 && scopes[0] === 'S1') scope = 'S1';
    else if (scopes.length === 1 && scopes[0] === 'S2') scope = 'S2';
    else if (scopes.includes('S1') && scopes.includes('S2')) scope = 'S1_S2';
    return {
      scope: scope as any,
      baselineYear: dto.baselineYear,
      baselineValue: 0,
      targetYear: dto.targetYear,
      targetReductionPct: dto.reductionPercent,
    };
  }

  async createSbti(tenantId: string, dto: CreateSbtiTargetDto, actorId: string) {
    const t = await (this.prisma as any).sbtiTarget.create({
      data: { ...this.toSbtiCreate(dto), tenantId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'SbtiTarget',
      entityId: t.id,
      action: 'CREATE',
      after: t,
    });
    return t;
  }

  async updateSbti(tenantId: string, id: string, dto: UpdateSbtiTargetDto, actorId: string) {
    const before = await (this.prisma as any).sbtiTarget.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Target not found');
    const data: Record<string, unknown> = {};
    if (dto.baselineYear !== undefined) data.baselineYear = dto.baselineYear;
    if (dto.targetYear !== undefined) data.targetYear = dto.targetYear;
    if (dto.reductionPercent !== undefined) data.targetReductionPct = dto.reductionPercent;
    const updated = await (this.prisma as any).sbtiTarget.update({ where: { id }, data });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'SbtiTarget',
      entityId: id,
      action: 'UPDATE',
      before,
      after: updated,
    });
    return updated;
  }

  async deleteSbti(tenantId: string, id: string, actorId: string) {
    const before = await (this.prisma as any).sbtiTarget.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Target not found');
    await (this.prisma as any).sbtiTarget.delete({ where: { id } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'SbtiTarget',
      entityId: id,
      action: 'delete',
      before,
    });
  }

  // ---- Abatement / MACC ----

  async listAbatement(tenantId: string) {
    // Schema AbatementProject has no createdAt; sort by id.
    return (this.prisma as any).abatementProject.findMany({ where: { tenantId }, orderBy: { id: 'desc' } });
  }

  private toAbatementCreate(dto: CreateAbatementProjectDto) {
    // Schema columns: capex, opex, expectedAnnualReductionTco2,
    // expectedLifetimeYears, marginalAbatementCost, scopeNodeIds[].
    const lifetimeYears = dto.lifetimeYears ?? 10;
    const mac =
      dto.annualAbatementTco2e > 0
        ? (dto.capexUsd / Math.max(1, lifetimeYears) + (dto.annualOpexDeltaUsd ?? 0)) / dto.annualAbatementTco2e
        : 0;
    return {
      name: dto.name,
      description: dto.description ?? null,
      capex: dto.capexUsd,
      opex: dto.annualOpexDeltaUsd ?? 0,
      expectedAnnualReductionTco2: dto.annualAbatementTco2e,
      expectedLifetimeYears: lifetimeYears,
      marginalAbatementCost: mac,
      scopeNodeIds: dto.scopeNodeId ? [dto.scopeNodeId] : [],
    };
  }

  async createAbatement(tenantId: string, dto: CreateAbatementProjectDto, actorId: string) {
    const p = await (this.prisma as any).abatementProject.create({
      data: { ...this.toAbatementCreate(dto), tenantId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AbatementProject',
      entityId: p.id,
      action: 'create',
      after: p,
    });
    return p;
  }

  async updateAbatement(tenantId: string, id: string, dto: UpdateAbatementProjectDto, actorId: string) {
    const before = await (this.prisma as any).abatementProject.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Project not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.capexUsd !== undefined) data.capex = dto.capexUsd;
    if (dto.annualOpexDeltaUsd !== undefined) data.opex = dto.annualOpexDeltaUsd;
    if (dto.annualAbatementTco2e !== undefined) data.expectedAnnualReductionTco2 = dto.annualAbatementTco2e;
    if (dto.lifetimeYears !== undefined) data.expectedLifetimeYears = dto.lifetimeYears;
    const updated = await (this.prisma as any).abatementProject.update({ where: { id }, data });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AbatementProject',
      entityId: id,
      action: 'UPDATE',
      before,
      after: updated,
    });
    return updated;
  }

  async deleteAbatement(tenantId: string, id: string, actorId: string) {
    const before = await (this.prisma as any).abatementProject.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Project not found');
    await (this.prisma as any).abatementProject.delete({ where: { id } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AbatementProject',
      entityId: id,
      action: 'delete',
      before,
    });
  }

  /**
   * Marginal Abatement Cost Curve. Cost-per-tonne = annualised cost / annual
   * tCO2e reduction, sorted ascending.
   */
  async macc(tenantId: string) {
    const projects: {
      id: string;
      name: string;
      annualAbatementTco2e: Decimal;
      capexUsd: Decimal;
      annualOpexDeltaUsd: Decimal | null;
      lifetimeYears: number | null;
      discountRate: Decimal | null;
    }[] = await (this.prisma as any).abatementProject.findMany({
      where: { tenantId },
    });
    const items = projects.map((p) => {
      const r = p.discountRate ? new Decimal(p.discountRate).div(100) : new Decimal(0.08);
      const n = p.lifetimeYears ?? 10;
      const annuityFactor = r.isZero()
        ? new Decimal(n)
        : new Decimal(1).minus(new Decimal(1).plus(r).pow(-n)).div(r); // (1-(1+r)^-n)/r
      const annualisedCapex = annuityFactor.isZero() ? new Decimal(p.capexUsd) : new Decimal(p.capexUsd).div(annuityFactor);
      const totalAnnualCost = annualisedCapex.plus(p.annualOpexDeltaUsd ?? 0);
      const abatement = new Decimal(p.annualAbatementTco2e);
      const costPerTonne = abatement.isZero() ? new Decimal(0) : totalAnnualCost.div(abatement);
      return {
        id: p.id,
        name: p.name,
        annualAbatementTco2e: abatement.toNumber(),
        costPerTonneUsd: costPerTonne.toNumber(),
        capexUsd: new Decimal(p.capexUsd).toNumber(),
      };
    });
    items.sort((a, b) => a.costPerTonneUsd - b.costPerTonneUsd);
    return items;
  }

  // ---- Carbon credits ----

  async listCredits(tenantId: string) {
    return (this.prisma as any).carbonCredit.findMany({ where: { tenantId }, orderBy: { vintage: 'desc' } });
  }

  async createCredit(tenantId: string, dto: CreateCarbonCreditDto, actorId: string) {
    const c = await (this.prisma as any).carbonCredit.create({ data: { ...dto, tenantId } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'CarbonCredit',
      entityId: c.id,
      action: 'create',
      after: c,
    });
    return c;
  }

  async updateCredit(tenantId: string, id: string, dto: UpdateCarbonCreditDto, actorId: string) {
    const before = await (this.prisma as any).carbonCredit.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Credit not found');
    const updated = await (this.prisma as any).carbonCredit.update({ where: { id }, data: dto });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'CarbonCredit',
      entityId: id,
      action: 'update',
      before,
      after: updated,
    });
    return updated;
  }

  async deleteCredit(tenantId: string, id: string, actorId: string) {
    const before = await (this.prisma as any).carbonCredit.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Credit not found');
    await (this.prisma as any).carbonCredit.delete({ where: { id } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'CarbonCredit',
      entityId: id,
      action: 'delete',
      before,
    });
  }

  // ---- Net-zero pathway ----

  /**
   * Linear pathway from baseline emissions → target year emissions.
   * Combines the most recent SBTi target with observed current emissions and
   * projected abatement projects.
   */
  async netZero(tenantId: string) {
    const target: {
      baselineYear: number;
      targetYear: number;
      reductionPercent: Decimal;
      scopes: string[];
    } | null = await (this.prisma as any).sbtiTarget.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!target) return { pathway: [], message: 'No SBTi target set' };

    const baselineEvents: { value: Decimal }[] = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        canonicalKey: 'ghg_total',
        periodEnd: {
          gte: new Date(target.baselineYear, 0, 1),
          lt: new Date(target.baselineYear + 1, 0, 1),
        },
      },
    });
    const baseline = baselineEvents.reduce((a, e) => a.plus(e.value), new Decimal(0));

    const targetEmissions = baseline.times(new Decimal(1).minus(new Decimal(target.reductionPercent).div(100)));
    const years = target.targetYear - target.baselineYear;
    const annualReduction = years > 0 ? baseline.minus(targetEmissions).div(years) : new Decimal(0);

    const pathway: { year: number; targetTco2e: number }[] = [];
    for (let y = target.baselineYear; y <= target.targetYear; y++) {
      const idx = y - target.baselineYear;
      pathway.push({
        year: y,
        targetTco2e: baseline.minus(annualReduction.times(idx)).toNumber(),
      });
    }
    return {
      baselineTco2e: baseline.toNumber(),
      targetTco2e: targetEmissions.toNumber(),
      baselineYear: target.baselineYear,
      targetYear: target.targetYear,
      pathway,
    };
  }
}
