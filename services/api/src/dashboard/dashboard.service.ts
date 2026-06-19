import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';

interface DashboardKpis {
  esgScore: { value: number; delta: number; target: number; percentile: number };
  emissionsTotal: { value: number; delta: number; sparkline: number[] };
  energyIntensity: { value: number; delta: number; sparkline: number[] };
  dataCompleteness: { value: number; delta: number; target: number };
}

@Injectable()
export class DashboardService {
  // India CEA grid factor (CEA v18, FY23-24): 0.716 kgCO2e/kWh.
  // Used to convert purchased_electricity_kwh into Scope 2 tCO2e when
  // there is no direct ghg_scope2_location event for the period.
  private static readonly CEA_TCO2E_PER_KWH = 7.16e-4;

  constructor(private readonly prisma: PrismaService) {}

  async kpis(tenantId: string): Promise<DashboardKpis> {
    // Pick the FY containing the most-recent approved metric_event so the
    // Dashboard reflects the customer's actual data window instead of an
    // empty "today's FY" period. Falls back to the current FY when there
    // is no data at all.
    const { periodStart, periodEnd } = await this.activeFy(tenantId);
    const priorStart = new Date(
      Date.UTC(periodStart.getUTCFullYear() - 1, periodStart.getUTCMonth(), periodStart.getUTCDate()),
    );
    const priorEnd = new Date(
      Date.UTC(periodEnd.getUTCFullYear() - 1, periodEnd.getUTCMonth(), periodEnd.getUTCDate(), 23, 59, 59),
    );

    const [thisFyEvents, priorFyEvents, mappingCount, mappingsWithData] =
      await Promise.all([
        this.fetchEvents(tenantId, periodStart, periodEnd),
        this.fetchEvents(tenantId, priorStart, priorEnd),
        (this.prisma as any).frameworkMapping.count(),
        // Distinct canonical_keys with at least one APPROVED/LOCKED event.
        (this.prisma as any).metricEvent.findMany({
          where: { tenantId, status: { in: ['APPROVED', 'LOCKED'] } },
          select: { canonicalKey: true },
          distinct: ['canonicalKey'],
        }),
      ]);

    const thisFyTotal = this.computeScope2(thisFyEvents);
    const priorFyTotal = this.computeScope2(priorFyEvents);
    const deltaPct = priorFyTotal.greaterThan(0)
      ? thisFyTotal.minus(priorFyTotal).div(priorFyTotal).times(100)
      : new Decimal(0);

    // Sparkline = monthly tCO2e across the active FY (12 buckets, Apr→Mar).
    const monthly = new Map<string, Decimal>();
    for (const ev of thisFyEvents) {
      if (!this.isEnergyOrGhg(ev.canonicalKey)) continue;
      const ym = ev.periodEnd.toISOString().slice(0, 7);
      const tco2e = this.toTco2e(ev.canonicalKey, ev.value);
      monthly.set(ym, (monthly.get(ym) ?? new Decimal(0)).plus(tco2e));
    }
    const sparkline = this.fySparkline(monthly, periodStart);

    // Data completeness = distinct canonical_keys with data / canonical_keys
    // referenced by any framework_mapping. Stored as a 0..1 fraction so the
    // KPI card's *100 percent renderer ends up showing the right number.
    const totalCanonicalKeys = await this.distinctMappedKeys();
    const populated = (mappingsWithData as Array<{ canonicalKey: string }>).length;
    const completenessFraction =
      totalCanonicalKeys > 0 ? populated / totalCanonicalKeys : 0;
    const completenessPct = Math.round(100 * completenessFraction);

    return {
      esgScore: {
        // ESG score = completeness × 0.8 (placeholder until a real
        // scoring methodology — e.g. CRISIL / S&P — is wired). Returning
        // 0 here would mask the real progress so we expose a relative
        // signal instead.
        value: Math.round(completenessPct * 0.8),
        delta: 0,
        target: 80,
        percentile: 50,
      },
      emissionsTotal: {
        value: Number(thisFyTotal.toFixed(3)),
        delta: Number(deltaPct.toFixed(2)),
        sparkline,
      },
      energyIntensity: {
        // Intensity = total energy / revenue. We don't have revenue on
        // tenant yet, so return total electricity in MWh for now —
        // honest signal: customer sees their real energy use.
        value: Number(this.totalPurchasedElectricity(thisFyEvents).div(1000).toFixed(2)),
        delta: 0,
        sparkline,
      },
      dataCompleteness: {
        // Fraction in [0,1] — the Dashboard KPI card formatter multiplies
        // by 100 to render as a percent.
        value: Number(completenessFraction.toFixed(4)),
        delta: 0,
        target: 0.9,
      },
    };
  }

  async activity(tenantId: string) {
    // Most recent N audit_log entries — the live "what just happened" feed.
    // Note: Prisma field is `actorUserId` (not `userId`).
    const rows: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      actorUserId: string | null;
      createdAt: Date;
    }> = await (this.prisma as any).auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actor: r.actorUserId ?? 'system',
      action: r.action,
      target: `${r.entityType}${r.entityId ? ' / ' + r.entityId.slice(-6) : ''}`,
    }));
  }

  async anomalies(tenantId: string) {
    // Metric events flagged LOW confidence — the closest proxy to
    // "anomalies" until the rule engine output is persisted. Returns
    // newest first.
    const lows: Array<{
      id: string;
      canonicalKey: string;
      value: Decimal;
      unit: string;
      confidenceLevel: string | null;
      createdAt: Date;
    }> = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        confidenceLevel: 'LOW',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        canonicalKey: true,
        value: true,
        unit: true,
        confidenceLevel: true,
        createdAt: true,
      },
    });
    return lows.map((m) => ({
      id: m.id,
      severity: 'medium',
      title: `${m.canonicalKey} flagged for review`,
      impact: `${m.value} ${m.unit}`,
      at: m.createdAt.toISOString(),
    }));
  }

  // -------------------- helpers --------------------

  private async fetchEvents(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<{ canonicalKey: string; value: Decimal; periodEnd: Date }>> {
    return (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
        status: { in: ['APPROVED', 'LOCKED'] },
      },
      select: { canonicalKey: true, value: true, periodEnd: true },
    });
  }

  private computeScope2(
    events: Array<{ canonicalKey: string; value: Decimal }>,
  ): Decimal {
    // Sum only the GHG output series (already in tCO2e). When the calc
    // worker has run, ghg_scope2_location and ghg_scope1_* rows exist
    // and represent the authoritative emissions for the period; adding
    // raw purchased_electricity_kwh × factor would double-count the
    // same kWh.
    //
    // When the calc has NOT run for the period, fall back to the raw-
    // input conversion so the dashboard isn't empty just because the
    // customer hasn't kicked off a calc yet.
    const hasComputedGhg = events.some((ev) => this.isComputedGhg(ev.canonicalKey));
    let total = new Decimal(0);
    for (const ev of events) {
      if (this.isComputedGhg(ev.canonicalKey)) {
        total = total.plus(ev.value);
      } else if (!hasComputedGhg && this.isRawEnergyInput(ev.canonicalKey)) {
        total = total.plus(this.toTco2e(ev.canonicalKey, ev.value));
      }
    }
    return total;
  }

  private isEnergyOrGhg(key: string): boolean {
    // Used by the monthly sparkline aggregation; keeps the historical
    // "anything that could be an emissions signal" semantics. The
    // headline total uses the stricter isComputedGhg+isRawEnergyInput
    // split above to avoid double counting.
    return this.isComputedGhg(key) || this.isRawEnergyInput(key);
  }

  /** True for canonical_keys that already carry a tCO2e value (output
   *  of the calc engine — Scope 1 sub-categories, Scope 2 location/market,
   *  any Scope 3 category, and the aggregate scope totals). */
  private isComputedGhg(key: string): boolean {
    return (
      key === 'ghg_scope1_total' ||
      key === 'ghg_scope1_stationary' ||
      key === 'ghg_scope1_mobile' ||
      key === 'ghg_scope1_process' ||
      key === 'ghg_scope1_fugitive' ||
      key === 'ghg_scope2_location' ||
      key === 'ghg_scope2_market' ||
      /^ghg_scope3_cat\d+$/.test(key)
    );
  }

  /** True for raw activity-data keys (kWh, L, kg) that need an emission
   *  factor before they're a GHG number. Used only as the fallback path
   *  when no calc has run for the period. */
  private isRawEnergyInput(key: string): boolean {
    return key === 'purchased_electricity_kwh';
  }

  private toTco2e(key: string, value: Decimal): Decimal {
    if (key === 'purchased_electricity_kwh') {
      return value.times(DashboardService.CEA_TCO2E_PER_KWH);
    }
    // GHG keys are already in tCO2e.
    return value;
  }

  private totalPurchasedElectricity(
    events: Array<{ canonicalKey: string; value: Decimal }>,
  ): Decimal {
    let total = new Decimal(0);
    for (const ev of events) {
      if (ev.canonicalKey === 'purchased_electricity_kwh') {
        total = total.plus(ev.value);
      }
    }
    return total;
  }

  private fySparkline(
    monthly: Map<string, Decimal>,
    periodStart: Date,
  ): number[] {
    // 12 buckets starting from the FY's first month (Apr) through Mar.
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      const dt = new Date(
        Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + i, 1),
      );
      const ym = dt.toISOString().slice(0, 7);
      const v = monthly.get(ym);
      out.push(v ? Number(v.toFixed(3)) : 0);
    }
    return out;
  }

  private async distinctMappedKeys(): Promise<number> {
    // Count of distinct canonical_keys reachable through any
    // framework_mapping row. Used as the denominator for data completeness.
    const rows: Array<{ canonicalKeys: string[] }> = await (
      this.prisma as any
    ).frameworkMapping.findMany({
      select: { canonicalKeys: true },
    });
    const set = new Set<string>();
    for (const r of rows) for (const k of r.canonicalKeys ?? []) set.add(k);
    return set.size;
  }

  private async activeFy(tenantId: string): Promise<{ periodStart: Date; periodEnd: Date }> {
    // Find the most recent approved metric_event for this tenant and use
    // its periodEnd to derive the FY. Avoids the dashboard rendering "0"
    // simply because today is in a different fiscal year than the data.
    const latest: { periodEnd: Date } | null = await (
      this.prisma as any
    ).metricEvent.findFirst({
      where: { tenantId, status: { in: ['APPROVED', 'LOCKED'] } },
      orderBy: { periodEnd: 'desc' },
      select: { periodEnd: true },
    });
    if (!latest) return this.currentFy();
    const d = latest.periodEnd;
    const year = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return {
      periodStart: new Date(Date.UTC(year, 3, 1)),
      periodEnd: new Date(Date.UTC(year + 1, 2, 31, 23, 59, 59)),
    };
  }

  private currentFy(): { periodStart: Date; periodEnd: Date } {
    // Indian FY runs Apr 1 → Mar 31. Default the Dashboard to the FY
    // containing "today" so newly approved data shows up immediately.
    const now = new Date();
    const year =
      now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return {
      periodStart: new Date(Date.UTC(year, 3, 1)),
      periodEnd: new Date(Date.UTC(year + 1, 2, 31, 23, 59, 59)),
    };
  }

  private priorFy(): { periodStart: Date; periodEnd: Date } {
    const { periodStart, periodEnd } = this.currentFy();
    return {
      periodStart: new Date(
        Date.UTC(periodStart.getUTCFullYear() - 1, 3, 1),
      ),
      periodEnd: new Date(
        Date.UTC(periodEnd.getUTCFullYear() - 1, 2, 31, 23, 59, 59),
      ),
    };
  }
}
