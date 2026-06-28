"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMetricRegistry } from "@/lib/api/queries";
import { FRAMEWORKS } from "@/lib/constants";
import { AlertTriangle, Layers } from "lucide-react";

export default function MappingsPage() {
  const { data: metrics, isLoading, isError, error, refetch } = useMetricRegistry();
  const list = Array.isArray(metrics) ? metrics : [];
  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Framework Mappings" description="Canonical metrics mapped to each framework section" />
        <TableSkeleton rows={8} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Framework Mappings" description="Canonical metrics mapped to each framework section" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load metric registry"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Framework Mappings" description="Canonical metrics mapped to each framework section" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">Metric</th>
                  {FRAMEWORKS.map((f) => (
                    <th key={f.id} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">{f.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.length === 0 && (
                  <tr>
                    <td colSpan={FRAMEWORKS.length + 1}>
                      <EmptyState
                        icon={<Layers className="h-6 w-6" />}
                        title="No metric mappings yet"
                        description="Metrics will appear here as they are added to your tenant's registry."
                      />
                    </td>
                  </tr>
                )}
                {list.map((m) => {
                  const mFrameworks = Array.isArray(m?.frameworks) ? m.frameworks : [];
                  return (
                    <tr key={m.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{m.name}</div>
                        <code className="text-[10px] text-slate-500">{m.canonicalKey}</code>
                      </td>
                      {FRAMEWORKS.map((f) => {
                        const map = mFrameworks.find((x) => x?.id === f.id);
                        // Fallback color guarantees we never emit invalid CSS like "undefined40".
                        const color = f.color ?? "#64748b";
                        return (
                          <td key={f.id} className="px-3 py-2">
                            {map ? (
                              <Badge size="sm" variant="outline" style={{ borderColor: `${color}40`, color }}>
                                {map.ref}
                              </Badge>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
