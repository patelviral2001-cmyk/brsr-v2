"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { useAbatement } from "@/lib/api/queries";
import { formatINR } from "@/lib/format";
import { AlertTriangle, TrendingDown, ArrowRight } from "lucide-react";

export default function AbatementPage() {
  const { data: projects, isLoading, isError, error, refetch } = useAbatement();

  if (isLoading) {
    return (
      <div className="p-6">
        <PageHeader title="Abatement projects" />
        <PageSkeleton />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Abatement projects" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load abatement projects"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  const list = Array.isArray(projects) ? projects : [];
  const totalReduction = list.reduce(
    (a, p: any) => a + Number(p?.annualAbatementTco2e ?? p?.reductionTCO2e ?? 0),
    0,
  );
  const totalCapex = list.reduce(
    (a, p: any) => a + Number(p?.capexUsd ?? p?.capexINR ?? 0),
    0,
  );

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Abatement projects"
        description="Planned + in-flight initiatives that reduce future emissions"
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/carbon/macc">View MACC <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Projects</CardDescription>
            <CardTitle className="text-2xl">{list.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total reduction</CardDescription>
            <CardTitle className="text-2xl">
              {totalReduction.toLocaleString("en-IN", { maximumFractionDigits: 1 })} tCO2e/y
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total CAPEX</CardDescription>
            <CardTitle className="text-2xl">{formatINR(totalCapex)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<TrendingDown className="h-6 w-6" />}
          title="No abatement projects yet"
          description="Projects you propose, approve, or implement to reduce future emissions will appear here. The MACC view ranks them by ₹/tCO2e once you add a few."
          action={
            <Button asChild>
              <Link href="/carbon/macc">Open MACC</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Annual abatement</th>
                  <th className="px-4 py-2 text-right">CAPEX</th>
                  <th className="px-4 py-2 text-right">Lifetime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((p: any) => (
                  <tr key={p.id ?? p.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.name ?? "Untitled"}</div>
                      {p.description ? (
                        <div className="text-xs text-slate-500">{p.description}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge size="sm" variant="outline">{p.status ?? "PROPOSED"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(p.annualAbatementTco2e ?? p.reductionTCO2e ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} tCO2e
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatINR(Number(p.capexUsd ?? p.capexINR ?? 0))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.lifetimeYears ? `${p.lifetimeYears} yrs` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
