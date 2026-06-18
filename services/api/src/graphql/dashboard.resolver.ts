import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { UseInterceptors } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import {
  AnomalyRow,
  DashboardKpi,
  EmissionsTrend,
  FacilityComparisonRow,
} from './dashboard.types';

@UseInterceptors(TenantInterceptor)
@Resolver()
export class DashboardResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [DashboardKpi])
  async dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Args('fy') fy: string,
    @Args('scope', { nullable: true }) scope?: string,
  ): Promise<DashboardKpi[]> {
    const period = parseFy(fy);
    const keys = ['ghg_scope1_total', 'ghg_scope2_market', 'ghg_total', 'energy_total_mwh', 'water_withdrawn_kl'];
    const events: { canonicalKey: string; value: Decimal; unit: string }[] =
      await (this.prisma as any).metricEvent.findMany({
        where: {
          tenantId: user.tenantId,
          canonicalKey: { in: keys },
          periodStart: { gte: period.start },
          periodEnd: { lte: period.end },
          status: { in: ['APPROVED', 'LOCKED'] },
          
          ...(scope ? { scopeNodeId: scope } : {}),
        },
      });

    const totals = aggregate(events);
    return Object.entries(totals).map(([k, v]) => ({
      key: k,
      label: prettyLabel(k),
      value: v.value,
      unit: v.unit,
    }));
  }

  @Query(() => EmissionsTrend)
  async emissionsTrend(
    @CurrentUser() user: AuthenticatedUser,
    @Args('fy') fy: string,
  ): Promise<EmissionsTrend> {
    const period = parseFy(fy);
    const months: string[] = [];
    const s1: number[] = [];
    const s2: number[] = [];
    const s3: number[] = [];
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(period.start.getFullYear(), period.start.getMonth() + m, 1);
      const monthEnd = new Date(period.start.getFullYear(), period.start.getMonth() + m + 1, 0);
      months.push(monthStart.toISOString().slice(0, 7));
      s1.push(await this.sumKey(user.tenantId, 'ghg_scope1_total', monthStart, monthEnd));
      s2.push(await this.sumKey(user.tenantId, 'ghg_scope2_market', monthStart, monthEnd));
      let s3Sum = 0;
      for (let cat = 1; cat <= 15; cat++) {
        s3Sum += await this.sumKey(user.tenantId, `ghg_scope3_cat${cat}`, monthStart, monthEnd);
      }
      s3.push(s3Sum);
    }
    return { months, scope1: s1, scope2: s2, scope3: s3 };
  }

  @Query(() => [FacilityComparisonRow])
  async facilityComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Args('fy') fy: string,
  ): Promise<FacilityComparisonRow[]> {
    const period = parseFy(fy);
    const facilities: { id: string; name: string }[] = await (this.prisma as any).hierarchyNode.findMany({
      where: { tenantId: user.tenantId, type: 'FACILITY' },
      select: { id: true, name: true },
    });
    const rows: FacilityComparisonRow[] = [];
    for (const f of facilities) {
      const emissions = await this.sumKey(user.tenantId, 'ghg_total', period.start, period.end, f.id);
      const energy = await this.sumKey(user.tenantId, 'energy_total_mwh', period.start, period.end, f.id);
      rows.push({
        nodeId: f.id,
        name: f.name,
        emissionsTco2e: emissions,
        energyMwh: energy || undefined,
        emissionsIntensity: energy > 0 ? emissions / energy : undefined,
      });
    }
    return rows.sort((a, b) => b.emissionsTco2e - a.emissionsTco2e);
  }

  @Query(() => [AnomalyRow])
  async topAnomalies(
    @CurrentUser() user: AuthenticatedUser,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<AnomalyRow[]> {
    const flags: {
      id: string;
      canonicalKey: string;
      scopeNodeId: string;
      value: Decimal;
      unit: string;
      zScore: Decimal | null;
      reason: string | null;
    }[] = await (this.prisma as any).anomalyFlag.findMany({
      where: { tenantId: user.tenantId, status: 'OPEN' },
      orderBy: { zScore: 'desc' },
      take: limit,
    });
    return flags.map((f, i) => ({
      id: f.id,
      canonicalKey: f.canonicalKey,
      scopeNodeId: f.scopeNodeId,
      value: new Decimal(f.value).toNumber(),
      unit: f.unit,
      zScore: f.zScore ? new Decimal(f.zScore).toNumber() : 0,
      reason: f.reason ?? 'unspecified',
      rank: i + 1,
    }));
  }

  // ---- helpers ----
  private async sumKey(
    tenantId: string,
    key: string,
    from: Date,
    to: Date,
    scopeNodeId?: string,
  ): Promise<number> {
    const rows: { value: Decimal }[] = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        canonicalKey: key,
        periodStart: { gte: from },
        periodEnd: { lte: to },
        ...(scopeNodeId ? { scopeNodeId } : {}),
        status: { in: ['APPROVED', 'LOCKED'] },
        
      },
      select: { value: true },
    });
    return rows.reduce((a, r) => a + new Decimal(r.value).toNumber(), 0);
  }
}

function aggregate(events: { canonicalKey: string; value: Decimal; unit: string }[]): Record<string, { value: number; unit: string }> {
  const m: Record<string, { value: number; unit: string }> = {};
  for (const e of events) {
    const prev = m[e.canonicalKey] ?? { value: 0, unit: e.unit };
    prev.value += new Decimal(e.value).toNumber();
    m[e.canonicalKey] = prev;
  }
  return m;
}

function prettyLabel(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseFy(fy: string): { start: Date; end: Date } {
  const m = fy.match(/(\d{2,4})\D+(\d{2,4})/);
  if (!m) {
    const y = parseInt(fy, 10);
    return { start: new Date(y, 3, 1), end: new Date(y + 1, 2, 31) };
  }
  let a = parseInt(m[1] as string, 10);
  let b = parseInt(m[2] as string, 10);
  if (a < 100) a += 2000;
  if (b < 100) b += 2000;
  return { start: new Date(a, 3, 1), end: new Date(b, 2, 31) };
}
