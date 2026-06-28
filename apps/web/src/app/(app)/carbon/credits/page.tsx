"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { useCarbonCredits } from "@/lib/api/queries";
import { AlertTriangle, Leaf } from "lucide-react";

export default function CarbonCreditsPage() {
  const { data: credits, isLoading, isError, error, refetch } = useCarbonCredits();

  if (isLoading) {
    return (
      <div className="p-6">
        <PageHeader title="Carbon credits" />
        <PageSkeleton />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Carbon credits" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load carbon credits"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  const list = (Array.isArray(credits) ? credits : []) as Array<any>;
  const totalVolume = list.reduce((a, c) => a + Number(c?.quantityTco2e ?? c?.volume ?? 0), 0);
  const retired = list.filter((c) => (c?.status ?? "").toString().toUpperCase() === "RETIRED");
  const available = list.filter((c) => (c?.status ?? "").toString().toUpperCase() === "AVAILABLE");

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Carbon credits"
        description="Verified offset units held, retired, or pending retirement"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total volume</CardDescription>
            <CardTitle className="text-2xl">
              {totalVolume.toLocaleString("en-IN", { maximumFractionDigits: 1 })} tCO2e
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Retired</CardDescription>
            <CardTitle className="text-2xl">{retired.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Available</CardDescription>
            <CardTitle className="text-2xl">{available.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Leaf className="h-6 w-6" />}
          title="No carbon credits recorded"
          description="Credits you purchase from Verra, Gold Standard, ART TREES, or other registries will appear here once added."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Serial</th>
                  <th className="px-4 py-2 text-left">Registry</th>
                  <th className="px-4 py-2 text-left">Vintage</th>
                  <th className="px-4 py-2 text-right">Volume</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((c) => (
                  <tr key={c?.id ?? c?.serialNumber ?? Math.random()} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{c?.serialNumber ?? c?.serial ?? "—"}</td>
                    <td className="px-4 py-3">{c?.registry ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{c?.vintageYear ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(c?.quantityTco2e ?? c?.volume ?? 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge size="sm" variant="outline">{c?.status ?? "—"}</Badge>
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
