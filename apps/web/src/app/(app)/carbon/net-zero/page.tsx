"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { NetZeroPathway } from "@/components/charts/net-zero-pathway";
import { useNetZero } from "@/lib/api/queries";
import { formatTonnesCO2e, formatPercent } from "@/lib/format";
import { AlertTriangle, TrendingDown } from "lucide-react";

export default function NetZeroPage() {
  const { data: nz, isLoading, isError, error, refetch } = useNetZero();
  if (isLoading) return (<div className="p-6"><PageHeader title="Net Zero & SBTi" /><PageSkeleton /></div>);
  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Net Zero & SBTi" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load net-zero target"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }
  if (!nz) {
    return (
      <div className="p-6">
        <PageHeader title="Net Zero & SBTi" />
        <EmptyState
          icon={<TrendingDown className="h-6 w-6" />}
          title="No net-zero target configured"
          description="Set a base year, base emissions, and target year to render the pathway."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Net Zero & SBTi" description="Science-based pathway with annual milestones" />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Base year" value={String(nz.baseYear ?? "—")} />
        <Stat label="Base emissions" value={formatTonnesCO2e(nz.baseEmissions ?? 0, { compact: true })} />
        <Stat label="Target reduction" value={formatPercent(nz.targetReduction ?? 0, 0)} />
        <Stat label="Target year" value={String(nz.targetYear ?? "—")} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pathway</CardTitle>
              <CardDescription>Target vs Actual vs BAU</CardDescription>
            </div>
            <div className="flex gap-2">
              {nz.ambition && <Badge variant="success">{nz.ambition}</Badge>}
              {nz.sbti && <Badge variant="primary">SBTi Validated</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <NetZeroPathway data={Array.isArray(nz.pathway) ? nz.pathway : []} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
