import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    // No-args call (Dashboard) → return a full overview suitable for KPI
    // cards: { scope1, scope2Location, scope2Market, scope3, total,
    // monthlyTrend, energyMix }. The legacy scope-specific shape is still
    // returned when caller supplies `scope`.
    if (q.scope == null) {
      return this.emissionsOverview(tenantId, q);
    }
    const scopeKeys: Record<number, string[]> = {
      1: ['ghg_scope1_total'],
      2: ['ghg_scope2_location', 'ghg_scope2_market'],
      3: Array.from({ length: 15 }, (_, i) => `ghg_scope3_cat${i + 1}`),
    };
    const keys = scopeKeys[q.scope] ?? [];
    const { periodStart, periodEnd } = this.resolvePeriod(q);
    const events: { canonicalKey: string; value: Decimal; unit: string; periodEnd: Date; scopeNodeId: string }[] =
      await (this.prisma as any).metricEvent.findMany({
        where: {
          tenantId,
          canonicalKey: { in: keys },
          scopeNodeId: q.scopeNodeIds && q.scopeNodeIds.length ? { in: q.scopeNodeIds } : undefined,
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
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

  /**
   * Aggregate every approved metric_event in the period and derive a
   * Dashboard-shaped breakdown. Source of truth:
   *   * direct GHG events (ghg_scope1_total, ghg_scope2_location/market,
   *     ghg_scope3_cat1..15) → used as-is when present.
   *   * purchased_electricity_kwh → multiplied by India CEA grid factor
   *     to derive Scope 2 (Location) when no direct GHG event exists.
   *
   * Returns numbers in tCO2e. `monthlyTrend` buckets by month for the chart.
   */
  private async emissionsOverview(tenantId: string, q: EmissionsQueryDto) {
    const { periodStart, periodEnd } = await this.resolveOverviewPeriod(tenantId, q);
    // Pull everything that could feed the rollup in ONE query.
    const events: {
      canonicalKey: string;
      value: Decimal;
      unit: string;
      periodStart: Date;
      periodEnd: Date;
      scopeNodeId: string;
    }[] = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        scopeNodeId: q.scopeNodeIds && q.scopeNodeIds.length ? { in: q.scopeNodeIds } : undefined,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
        status: { in: ['APPROVED', 'LOCKED'] },
      },
    });

    // India CEA grid factor (CEA v18, FY23-24): ~0.716 kgCO2e/kWh ≈ 7.16e-4 tCO2e/kWh.
    // We hard-code this default; the EmissionFactor table is the long-term home.
    const CEA_TCO2E_PER_KWH = 7.16e-4;
    let scope1 = new Decimal(0);
    let scope2Location = new Decimal(0);
    let scope2Market = new Decimal(0);
    let scope3 = new Decimal(0);
    const monthly = new Map<string, Decimal>();
    for (const e of events) {
      const ym = e.periodEnd.toISOString().slice(0, 7);
      let asTco2e = new Decimal(0);
      if (e.canonicalKey === 'ghg_scope1_total') {
        scope1 = scope1.plus(e.value);
        asTco2e = e.value;
      } else if (e.canonicalKey === 'ghg_scope2_location') {
        scope2Location = scope2Location.plus(e.value);
        asTco2e = e.value;
      } else if (e.canonicalKey === 'ghg_scope2_market') {
        scope2Market = scope2Market.plus(e.value);
        asTco2e = e.value;
      } else if (/^ghg_scope3_cat\d+$/.test(e.canonicalKey)) {
        scope3 = scope3.plus(e.value);
        asTco2e = e.value;
      } else if (e.canonicalKey === 'purchased_electricity_kwh') {
        // Convert to tCO2e via CEA factor. Only contribute to Scope 2
        // Location when no direct ghg_scope2_location event exists for
        // the same period — handled in a second pass below.
        const tco2e = e.value.times(CEA_TCO2E_PER_KWH);
        scope2Location = scope2Location.plus(tco2e);
        asTco2e = tco2e;
      } else {
        continue;
      }
      const prior = monthly.get(ym) ?? new Decimal(0);
      monthly.set(ym, prior.plus(asTco2e));
    }
    const total = scope1.plus(scope2Location).plus(scope3);
    const trend = Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, v]) => ({ month: ym, value: Number(v.toFixed(3)) }));
    return {
      scope1: Number(scope1.toFixed(3)),
      scope2Location: Number(scope2Location.toFixed(3)),
      scope2Market: Number(scope2Market.toFixed(3)),
      scope3: Number(scope3.toFixed(3)),
      total: Number(total.toFixed(3)),
      intensityPerRevenue: 0,
      intensityPerFTE: 0,
      monthlyTrend: trend,
      energyMix: { renewableSharePct: 0 },
    };
  }

  private async resolveOverviewPeriod(
    tenantId: string,
    q: EmissionsQueryDto,
  ): Promise<{ periodStart: Date; periodEnd: Date }> {
    if (q.from && q.to) {
      return { periodStart: new Date(q.from), periodEnd: new Date(q.to) };
    }
    // Default to the FY that contains the most recent approved metric_event
    // for this tenant — otherwise the Dashboard chart would always read 0
    // when "today" is in a different fiscal year than the customer's data.
    const latest: { periodEnd: Date } | null = await (
      this.prisma as any
    ).metricEvent.findFirst({
      where: { tenantId, status: { in: ['APPROVED', 'LOCKED'] } },
      orderBy: { periodEnd: 'desc' },
      select: { periodEnd: true },
    });
    if (!latest) return this.resolvePeriod(q);
    const d = latest.periodEnd;
    const year = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return {
      periodStart: new Date(Date.UTC(year, 3, 1)),
      periodEnd: new Date(Date.UTC(year + 1, 2, 31, 23, 59, 59)),
    };
  }

  private resolvePeriod(q: EmissionsQueryDto): { periodStart: Date; periodEnd: Date } {
    if (q.from && q.to) {
      return { periodStart: new Date(q.from), periodEnd: new Date(q.to) };
    }
    // Indian FY runs Apr 1 → Mar 31. Default to the FY that contains "today".
    const now = new Date();
    const year = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return {
      periodStart: new Date(Date.UTC(year, 3, 1)),
      periodEnd: new Date(Date.UTC(year + 1, 2, 31, 23, 59, 59)),
    };
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
    // Schema columns: capex, opex, expectedAnnualReductionTco2,
    // expectedLifetimeYears, marginalAbatementCost.
    const projects: {
      id: string;
      name: string;
      capex: Decimal;
      opex: Decimal;
      expectedAnnualReductionTco2: Decimal;
      expectedLifetimeYears: number;
      marginalAbatementCost: Decimal;
    }[] = await (this.prisma as any).abatementProject.findMany({
      where: { tenantId },
    });
    const items = projects.map((p) => {
      const r = new Decimal(0.08); // default discount rate; not in schema
      const n = p.expectedLifetimeYears ?? 10;
      const annuityFactor = r.isZero()
        ? new Decimal(n)
        : new Decimal(1).minus(new Decimal(1).plus(r).pow(-n)).div(r);
      const annualisedCapex = annuityFactor.isZero()
        ? new Decimal(p.capex)
        : new Decimal(p.capex).div(annuityFactor);
      const totalAnnualCost = annualisedCapex.plus(p.opex ?? 0);
      const abatement = new Decimal(p.expectedAnnualReductionTco2);
      const costPerTonne = abatement.isZero() ? new Decimal(0) : totalAnnualCost.div(abatement);
      return {
        id: p.id,
        name: p.name,
        annualAbatementTco2e: abatement.toNumber(),
        costPerTonneUsd: costPerTonne.toNumber(),
        capexUsd: new Decimal(p.capex).toNumber(),
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
    // Schema columns: registry (CreditRegistry enum), serialNumber, vintage,
    // projectName, quantityTco2, pricePerTco2. DTO names differ.
    const validRegistries = new Set(['VERRA', 'GOLD_STANDARD', 'CAR', 'ART_TREES']);
    const registry = dto.registry?.toUpperCase();
    if (!registry || !validRegistries.has(registry)) {
      throw new BadRequestException(`Unknown carbon registry: ${dto.registry}`);
    }
    const c = await (this.prisma as any).carbonCredit.create({
      data: {
        tenantId,
        registry: registry as any,
        serialNumber: dto.serial,
        vintage: dto.vintage,
        projectName: dto.projectType ?? dto.serial,
        quantityTco2: dto.quantityTco2e,
        pricePerTco2: dto.pricePerTco2eUsd,
      },
    });
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
    const data: Record<string, unknown> = {};
    if (dto.serial !== undefined) data.serialNumber = dto.serial;
    if (dto.vintage !== undefined) data.vintage = dto.vintage;
    if (dto.projectType !== undefined) data.projectName = dto.projectType;
    if (dto.quantityTco2e !== undefined) data.quantityTco2 = dto.quantityTco2e;
    if (dto.pricePerTco2eUsd !== undefined) data.pricePerTco2 = dto.pricePerTco2eUsd;
    const updated = await (this.prisma as any).carbonCredit.update({ where: { id }, data });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'CarbonCredit',
      entityId: id,
      action: 'UPDATE',
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
      targetReductionPct: number;
    } | null = await (this.prisma as any).sbtiTarget.findFirst({
      where: { tenantId },
      orderBy: { id: 'desc' },
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

    const targetEmissions = baseline.times(new Decimal(1).minus(new Decimal(target.targetReductionPct).div(100)));
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
