"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { EmissionsByScopeChart } from "@/components/charts/emissions-by-scope";
import { EmissionsTrendChart } from "@/components/charts/emissions-trend";
import { EnergyMixChart } from "@/components/charts/energy-mix";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { useEmissionsOverview } from "@/lib/api/queries";
import { formatTonnesCO2e, formatNumber } from "@/lib/format";
import { AlertTriangle, Factory, Zap, TrendingDown, Leaf } from "lucide-react";

export default function CarbonOverviewPage() {
  const { data: e, isLoading, isError, error, refetch } = useEmissionsOverview();

  if (isLoading) {
    return (<div className="p-6"><PageHeader title="Carbon Accounting" /><PageSkeleton /></div>);
  }
  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Carbon Accounting" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load emissions overview"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }
  if (!e) {
    return (
      <div className="p-6">
        <PageHeader title="Carbon Accounting" />
        <EmptyState
          icon={<Leaf className="h-6 w-6" />}
          title="No emissions data yet"
          description="Upload utility bills, fuel receipts, and policies to get started."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Carbon Accounting"
        description="GHG Protocol-aligned · Scope 1 + 2 (location + market) + 3 (15 categories)"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link href="/carbon/macc">MACC</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/carbon/net-zero">Net Zero</Link></Button>
          </>
        }
      />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Scope 1" value={formatTonnesCO2e(e.scope1 ?? 0, { compact: true })} icon={<Factory className="h-4 w-4" />} delta={-3.8} positiveIsGood={false} hint="Direct (stationary + mobile)" />
            <KpiCard label="Scope 2 (Loc)" value={formatTonnesCO2e(e.scope2Location ?? 0, { compact: true })} icon={<Zap className="h-4 w-4" />} delta={-12.2} positiveIsGood={false} hint="Grid average factors" />
            <KpiCard label="Scope 2 (Mkt)" value={formatTonnesCO2e(e.scope2Market ?? 0, { compact: true })} icon={<Zap className="h-4 w-4" />} delta={-31.0} positiveIsGood={false} hint="With REC procurement" />
            <KpiCard label="Scope 3" value={formatTonnesCO2e(e.scope3 ?? 0, { compact: true })} icon={<TrendingDown className="h-4 w-4" />} delta={-4.2} positiveIsGood={false} hint="All 15 categories" />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Monthly Trend</CardTitle>
                <CardDescription>Scope 1 / 2 / 3 stacked</CardDescription>
              </CardHeader>
              <CardContent><EmissionsTrendChart data={Array.isArray(e.monthlyTrend) ? e.monthlyTrend : []} /></CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Scope Breakdown</CardTitle>
                <CardDescription>{formatTonnesCO2e(e.total ?? 0, { compact: true })} total</CardDescription>
              </CardHeader>
              <CardContent><EmissionsByScopeChart data={e} /></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Energy Mix</CardTitle>
                <CardDescription>By source · MWh</CardDescription>
              </CardHeader>
              <CardContent><EnergyMixChart data={Array.isArray(e.energyMix) ? e.energyMix : []} /></CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Intensity Trend</CardTitle>
                <CardDescription>tCO2e per Cr INR & per FTE</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="py-2">FY</th>
                      <th className="py-2 text-right">per Cr INR</th>
                      <th className="py-2 text-right">per FTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(e.intensityTrend) ? e.intensityTrend : []).map((r) => (
                      <tr key={r.fy} className="border-b border-slate-100">
                        <td className="py-2 font-medium">{r.fy}</td>
                        <td className="py-2 text-right tabular-nums">{formatNumber(r.perRevenue, { decimals: 2 })}</td>
                        <td className="py-2 text-right tabular-nums">{formatNumber(r.perFTE, { decimals: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Quick links</CardTitle>
                  <CardDescription>Drill into each scope</CardDescription>
                </div>
                <Leaf className="h-5 w-5 text-primary-700" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { href: "/carbon/scope1", title: "Scope 1", desc: "Stationary, mobile, process, fugitive" },
                  { href: "/carbon/scope2", title: "Scope 2", desc: "Location vs market-based" },
                  { href: "/carbon/scope3", title: "Scope 3", desc: "15-category breakdown" },
                  { href: "/carbon/net-zero", title: "Net Zero", desc: "SBTi target & pathway" },
                ].map((l) => (
                  <Link key={l.href} href={l.href} className="rounded-lg border border-slate-200 p-3 transition-all hover:border-primary-300 hover:bg-primary-50">
                    <div className="text-sm font-semibold text-slate-900">{l.title}</div>
                    <div className="text-xs text-slate-500">{l.desc}</div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
    </div>
  );
}
