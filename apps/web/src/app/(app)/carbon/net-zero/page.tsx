"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { NetZeroPathway } from "@/components/charts/net-zero-pathway";
import { useNetZero } from "@/lib/api/queries";
import { formatTonnesCO2e, formatPercent } from "@/lib/format";

export default function NetZeroPage() {
  const { data: nz } = useNetZero();

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Net Zero & SBTi" description="Science-based pathway with annual milestones" />

      {nz && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Base year" value={String(nz.baseYear)} />
            <Stat label="Base emissions" value={formatTonnesCO2e(nz.baseEmissions, { compact: true })} />
            <Stat label="Target reduction" value={formatPercent(nz.targetReduction, 0)} />
            <Stat label="Target year" value={String(nz.targetYear)} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pathway</CardTitle>
                  <CardDescription>Target vs Actual vs BAU</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="success">{nz.ambition}</Badge>
                  {nz.sbti && <Badge variant="primary">SBTi Validated</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent><NetZeroPathway data={nz.pathway} /></CardContent>
          </Card>
        </>
      )}
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
