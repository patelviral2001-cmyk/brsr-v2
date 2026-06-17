"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { ScopeBreadcrumb } from "@/components/common/scope-breadcrumb";
import { KpiCard } from "@/components/common/kpi-card";
import { EmissionsTrendChart } from "@/components/charts/emissions-trend";
import { EnergyMixChart } from "@/components/charts/energy-mix";
import { FrameworkCompletionRings } from "@/components/charts/framework-completion-ring";
import { NetZeroPathway } from "@/components/charts/net-zero-pathway";
import { useDashboardKpis, useDashboardActivity, useDashboardAnomalies, useEmissionsOverview, useFrameworks, useNetZero } from "@/lib/api/queries";
import { formatTonnesCO2e, formatPercent, formatRelative } from "@/lib/format";
import { Sparkles, FileBarChart2, Upload, Database, AlertTriangle, ChevronRight, BarChart3, Zap, Leaf, Award } from "lucide-react";
import { useCommandPaletteStore } from "@/stores/command-palette.store";

export default function DashboardPage() {
  const { data: kpis } = useDashboardKpis() as { data: { esgScore: { value: number; delta: number; target: number; percentile: number }; emissionsTotal: { value: number; delta: number; sparkline: number[] }; energyIntensity: { value: number; delta: number; sparkline: number[] }; dataCompleteness: { value: number; delta: number; target: number } } | undefined };
  const { data: emissions } = useEmissionsOverview();
  const { data: frameworks } = useFrameworks();
  const { data: netzero } = useNetZero();
  const { data: activity } = useDashboardActivity() as { data: { id: string; at: string; actor: string; action: string; target: string }[] | undefined };
  const { data: anomalies } = useDashboardAnomalies() as { data: { id: string; severity: string; title: string; impact: string; at: string }[] | undefined };
  const openPalette = useCommandPaletteStore((s) => s.setOpen);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Executive Dashboard"
        description="FY24-25 · Imagine Powertree Group · Consolidated view"
        breadcrumb={<ScopeBreadcrumb />}
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link href="/reports/generate"><FileBarChart2 className="h-4 w-4" />Generate Report</Link></Button>
            <Button size="sm" className="bg-gradient-to-r from-primary-600 to-primary-800" asChild><Link href="/copilot"><Sparkles className="h-4 w-4" />Open Copilot</Link></Button>
          </>
        }
      />

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="ESG Score"
          value={kpis?.esgScore.value?.toString() ?? "—"}
          delta={kpis?.esgScore.delta}
          hint={`Top ${kpis?.esgScore.percentile ?? 0}th percentile in sector`}
          ring={{ value: kpis?.esgScore.value ?? 0, max: 100, label: "/ 100" }}
          icon={<Award className="h-4 w-4" />}
        />
        <KpiCard
          label="Total Emissions"
          value={emissions ? formatTonnesCO2e(emissions.total, { compact: true }) : "—"}
          delta={kpis?.emissionsTotal.delta}
          positiveIsGood={false}
          hint="Scope 1 + 2 + 3 (Location)"
          sparkline={kpis?.emissionsTotal.sparkline}
          icon={<Leaf className="h-4 w-4" />}
        />
        <KpiCard
          label="Energy Intensity"
          value={kpis ? `${kpis.energyIntensity.value.toFixed(3)}` : "—"}
          delta={kpis?.energyIntensity.delta}
          positiveIsGood={false}
          hint="MWh per ₹1k revenue"
          sparkline={kpis?.energyIntensity.sparkline}
          icon={<Zap className="h-4 w-4" />}
        />
        <KpiCard
          label="Data Completeness"
          value={kpis ? formatPercent(kpis.dataCompleteness.value, 0) : "—"}
          delta={kpis?.dataCompleteness.delta}
          hint={`Target: ${formatPercent(kpis?.dataCompleteness.target ?? 0, 0)}`}
          ring={{ value: Math.round((kpis?.dataCompleteness.value ?? 0) * 100), max: 100, label: "Done" }}
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      {/* Emissions Trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Emissions trend</CardTitle>
              <CardDescription>Apr 2025 – Mar 2026 · Scope 1 / 2 / 3 stacked, monthly</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild><Link href="/carbon">View details<ChevronRight className="h-3 w-3" /></Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          {emissions && <EmissionsTrendChart data={emissions.monthlyTrend} />}
        </CardContent>
      </Card>

      {/* Energy Mix + Framework Completion + Anomalies */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Energy Mix</CardTitle>
            <CardDescription>96.8% renewable</CardDescription>
          </CardHeader>
          <CardContent>
            {emissions && <EnergyMixChart data={emissions.energyMix} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Framework Completion</CardTitle>
            <CardDescription>Multi-framework filing readiness</CardDescription>
          </CardHeader>
          <CardContent>
            {frameworks && (
              <FrameworkCompletionRings data={frameworks.map((f) => ({ id: f.id, pct: f.completionPct / 100 }))} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Anomalies</CardTitle>
            <CardDescription>Auto-detected this quarter</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {anomalies?.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50">
                <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${a.severity === "HIGH" ? "bg-rose-50 text-rose-700" : a.severity === "MEDIUM" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{a.title}</div>
                  <div className="text-xs text-slate-500">{a.impact}</div>
                  <div className="mt-1 text-[10px] text-slate-400">{formatRelative(a.at)}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Net Zero + Supplier engagement */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Net-Zero Pathway</CardTitle>
                <CardDescription>SBTi-validated · 1.5°C aligned · 2045 net zero</CardDescription>
              </div>
              <Badge variant="success">SBTi Validated</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {netzero && <NetZeroPathway data={netzero.pathway} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supplier Engagement</CardTitle>
            <CardDescription>By risk tier · 25 active vendors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Tier 1 — Critical", value: 8, total: 8, color: "bg-emerald-600" },
                { label: "Tier 1 — Standard", value: 12, total: 14, color: "bg-emerald-500" },
                { label: "Tier 2", value: 5, total: 8, color: "bg-sky-500" },
                { label: "Tier 3 (estimate)", value: 0, total: 1, color: "bg-amber-500" },
              ].map((b) => (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{b.label}</span>
                    <span className="tabular-nums text-slate-500">{b.value} / {b.total}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${b.color}`} style={{ width: `${(b.value / b.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity feed + Quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Across your tenant</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activity?.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-transparent p-2.5 transition-colors hover:border-slate-200 hover:bg-slate-50">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
                    {a.actor.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-slate-900">{a.actor}</span>
                    <span className="text-slate-500"> {a.action} </span>
                    <span className="font-medium text-slate-900">{a.target}</span>
                  </div>
                  <span className="text-xs text-slate-400">{formatRelative(a.at)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2">
            <QuickAction icon={FileBarChart2} label="Generate Report" href="/reports/generate" />
            <QuickAction icon={Upload} label="Upload Files" href="/files/upload" />
            <QuickAction icon={Database} label="Add Metric" href="/metrics" />
            <QuickAction icon={Sparkles} label="Open Copilot" href="/copilot" highlighted />
            <button onClick={() => openPalette(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <Sparkles className="h-4 w-4 text-slate-400" />
              <span className="flex-1">Command palette</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px]">Cmd K</kbd>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Floating Copilot */}
      <Link href="/copilot" className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-800 px-4 py-3 text-white shadow-glow-emerald transition-transform hover:scale-105">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">Ask Copilot</span>
      </Link>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href, highlighted }: { icon: React.ComponentType<{ className?: string }>; label: string; href: string; highlighted?: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all hover:shadow-sm ${highlighted ? "border-primary-300 bg-primary-50 text-primary-900 hover:border-primary-400" : "border-slate-200 hover:bg-slate-50"}`}>
      <Icon className={`h-4 w-4 ${highlighted ? "text-primary-700" : "text-slate-400"}`} />
      <span className="flex-1 font-medium">{label}</span>
      <ChevronRight className="h-3 w-3 text-slate-400" />
    </Link>
  );
}
