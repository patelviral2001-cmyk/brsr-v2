"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { useScope3 } from "@/lib/api/queries";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatTonnesCO2e } from "@/lib/format";
import { AlertTriangle, Factory } from "lucide-react";

const COLORS = ["#047857", "#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#0284c7", "#0ea5e9", "#38bdf8", "#7c3aed", "#a78bfa", "#c084fc", "#ca8a04", "#eab308", "#facc15"];

export default function Scope3Page() {
  const { data: cats, isLoading, isError, error, refetch } = useScope3();
  if (isLoading) return (<div className="p-6"><PageHeader title="Scope 3" /><PageSkeleton /></div>);
  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Scope 3" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load Scope 3"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }
  const catsList = Array.isArray(cats) ? cats : [];
  const reported = catsList.filter((c) => c.status === "REPORTED");
  const total = reported.reduce((a, b) => a + (b.value ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Scope 3" description="Value chain emissions across all 15 GHG Protocol categories" />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Category breakdown</CardTitle>
            <CardDescription>{formatTonnesCO2e(total, { compact: true })} total</CardDescription>
          </CardHeader>
          <CardContent>
            {reported.length === 0 ? (
              <div
                className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400"
                role="img"
                aria-label="No reported Scope 3 categories"
              >
                No reported categories yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => `${(v ?? 0).toLocaleString("en-IN")} tCO2e`} />
                  <Pie data={reported} cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="name">
                    {reported.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>All 15 categories</CardTitle>
            <CardDescription>Methodology and reporting status per category</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">tCO2e</th>
                  <th className="px-4 py-2">Methodology</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catsList.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={<Factory className="h-6 w-6" />}
                        title="No Scope 3 categories configured"
                        description="Map your value-chain spend to GHG Protocol categories to get started."
                      />
                    </td>
                  </tr>
                )}
                {catsList.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{c.id}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{(c.value ?? 0) > 0 ? (c.value ?? 0).toLocaleString("en-IN") : "—"}</td>
                    <td className="px-4 py-2">
                      <Badge size="sm" variant="outline">{(c.methodology ?? "").replace("_", " ")}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge size="sm" variant={c.status === "REPORTED" ? "success" : c.status === "NA" ? "outline" : "warning"}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
