"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricRegistryCard } from "@/components/metrics/metric-registry-card";
import { MetricEventTable } from "@/components/metrics/metric-event-table";
import { useMetricRegistry, useMetricEvents } from "@/lib/api/queries";
import { FRAMEWORKS } from "@/lib/constants";
import { Plus, Search } from "lucide-react";

export default function MetricsPage() {
  const { data: registry } = useMetricRegistry();
  const { data: events } = useMetricEvents();
  const [q, setQ] = useState("");
  const [fw, setFw] = useState("all");

  const filtered = useMemo(() => {
    return (registry ?? []).filter((m) => {
      if (fw !== "all" && !m.frameworks.some((f) => f.id === fw)) return false;
      if (q && !`${m.name} ${m.canonicalKey} ${m.category}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [registry, q, fw]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((m) => {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Metrics"
        description="Canonical metric registry and metric events across all frameworks"
        actions={<Button size="sm"><Plus className="h-4 w-4" />New Metric</Button>}
      />

      <Tabs defaultValue="registry">
        <TabsList>
          <TabsTrigger value="registry">Registry <Badge variant="ghost" size="sm" className="ml-1.5">{registry?.length ?? 0}</Badge></TabsTrigger>
          <TabsTrigger value="events">Events <Badge variant="ghost" size="sm" className="ml-1.5">{events?.length ?? 0}</Badge></TabsTrigger>
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
            <Badge variant="ghost" className="ml-auto">{filtered.length} of {registry?.length ?? 0}</Badge>
          </div>
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
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardContent className="p-0">
              {events && <MetricEventTable events={events} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
