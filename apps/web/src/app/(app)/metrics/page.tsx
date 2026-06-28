"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { DataErrorBanner } from "@/components/common/data-error-banner";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { MetricRegistryCard } from "@/components/metrics/metric-registry-card";
import { MetricEventTable } from "@/components/metrics/metric-event-table";
import { useMetricRegistry, useMetricEvents } from "@/lib/api/queries";
import { FRAMEWORKS } from "@/lib/constants";
import { Database, Plus, Search } from "lucide-react";
import { toast } from "sonner";

export default function MetricsPage() {
  const search = useSearchParams();
  const initialTab = search?.get("tab") === "events" ? "events" : "registry";
  const { data: registry, isLoading: regLoading, isError: regError, refetch: regRefetch } = useMetricRegistry();
  const { data: events, isLoading: evtLoading, isError: evtError } = useMetricEvents();
  const [q, setQ] = useState("");
  const [fw, setFw] = useState("all");

  const filtered = useMemo(() => {
    const list = Array.isArray(registry) ? registry : [];
    return list.filter((m) => {
      const frameworks = Array.isArray(m?.frameworks) ? m.frameworks : [];
      if (fw !== "all" && !frameworks.some((f) => f?.id === fw)) return false;
      const haystack = `${m?.name ?? ""} ${m?.canonicalKey ?? ""} ${m?.category ?? ""}`.toLowerCase();
      if (q && !haystack.includes(q.toLowerCase())) return false;
      return true;
    });
  }, [registry, q, fw]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((m) => {
      const cat = m?.category ?? "Uncategorized";
      const arr = map.get(cat) ?? [];
      arr.push(m);
      map.set(cat, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Metrics"
        description="Canonical metric registry and metric events across all frameworks"
        actions={
          <Button
            size="sm"
            onClick={() =>
              toast.info("New Metric", {
                description: "Custom metrics ship in v2.1. For now, request a canonical key from your CSM.",
              })
            }
            aria-label="Create new metric"
          >
            <Plus className="h-4 w-4" />New Metric
          </Button>
        }
      />

      {(regError || evtError) ? (
        <DataErrorBanner
          message={
            regError && evtError
              ? "Failed to load the metric registry and metric events."
              : regError
                ? "Failed to load the metric registry."
                : "Failed to load metric events."
          }
          onRetry={() => regRefetch()}
        />
      ) : null}

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="registry">Registry <Badge variant="ghost" size="sm" className="ml-1.5">{Array.isArray(registry) ? registry.length : 0}</Badge></TabsTrigger>
          <TabsTrigger value="events">Events <Badge variant="ghost" size="sm" className="ml-1.5">{Array.isArray(events) ? events.length : 0}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="registry">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search canonical keys, names…" className="pl-9" />
            </div>
            <Select value={fw} onValueChange={setFw}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Framework" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All frameworks</SelectItem>
                {FRAMEWORKS.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="ghost" className="ml-auto">{filtered.length} of {Array.isArray(registry) ? registry.length : 0}</Badge>
          </div>
          {regLoading ? (
            <TableSkeleton rows={6} />
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={<Database className="h-6 w-6" />}
              title="No metrics match"
              description={
                Array.isArray(registry) && registry.length === 0
                  ? "Your tenant's metric registry is being seeded."
                  : "Try clearing filters."
              }
            />
          ) : (
            <div className="space-y-6">
              {grouped.map(([cat, metrics]) => (
                <div key={cat}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{cat}</h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {metrics.map((m) => <MetricRegistryCard key={m.id} metric={m} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events">
          {evtLoading ? (
            <TableSkeleton rows={8} />
          ) : !Array.isArray(events) || events.length === 0 ? (
            <EmptyState
              icon={<Database className="h-6 w-6" />}
              title="No metric events yet"
              description="Submit metrics from the registry to populate this list."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <MetricEventTable events={events} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
