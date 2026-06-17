"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { MaccChart } from "@/components/charts/macc-chart";
import { useMacc } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";

export default function MaccPage() {
  const { data: projects } = useMacc();
  const projectsList = Array.isArray(projects) ? projects : [];
  const sorted = projectsList.slice().sort((a, b) => (a.marginalCostINRPerTCO2e ?? 0) - (b.marginalCostINRPerTCO2e ?? 0));
  const totalReduction = sorted.reduce((a, b) => a + (b.reductionTCO2e ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Marginal Abatement Cost Curve" description="Prioritise projects by ₹/tCO2e and cumulative impact" />

      <Card>
        <CardHeader>
          <CardTitle>MACC</CardTitle>
          <CardDescription>{totalReduction.toLocaleString("en-IN")} tCO2e cumulative reduction</CardDescription>
        </CardHeader>
        <CardContent>
          {projectsList.length > 0 && <MaccChart projects={projectsList} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project list</CardTitle>
          <CardDescription>Sorted by marginal cost</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-right">Reduction</th>
                <th className="px-4 py-2 text-right">₹ / tCO2e</th>
                <th className="px-4 py-2 text-right">CAPEX</th>
                <th className="px-4 py-2 text-right">Payback</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-2"><Badge variant="outline" size="sm">{(p.category ?? "").replace("_", " ")}</Badge></td>
                  <td className="px-4 py-2 text-right tabular-nums">{(p.reductionTCO2e ?? 0).toLocaleString("en-IN")} tCO2e</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${(p.marginalCostINRPerTCO2e ?? 0) < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                    {(p.marginalCostINRPerTCO2e ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{(p.capexINR ?? 0) > 0 ? formatINR(p.capexINR, { compact: true }) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(p.paybackYears ?? 0) > 0 ? `${p.paybackYears} yrs` : "—"}</td>
                  <td className="px-4 py-2">
                    <Badge size="sm" variant={p.status === "COMPLETED" ? "success" : p.status === "APPROVED" ? "primary" : p.status === "IN_PROGRESS" ? "info" : "outline"}>
                      {(p.status ?? "").replace("_", " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
