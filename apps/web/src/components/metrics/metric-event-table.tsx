"use client";

import { DataTable, type Column } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/extraction/confidence-badge";
import { formatNumber, formatRelative } from "@/lib/format";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { MetricEvent } from "@/types";

export function MetricEventTable({ events, onRowClick }: { events: MetricEvent[]; onRowClick?: (e: MetricEvent) => void }) {
  const columns: Column<MetricEvent>[] = [
    { key: "metricName", header: "Metric", sortable: true, cell: (r) => (
      <div>
        <div className="text-sm font-medium text-slate-900">{r.metricName}</div>
        <code className="text-[10px] text-slate-500">{r.metricKey}</code>
      </div>
    )},
    { key: "scopeNodeName", header: "Scope", sortable: true, cell: (r) => <span className="text-xs text-slate-600">{r.scopeNodeName}</span> },
    { key: "fy", header: "FY", sortable: true, width: "80px" },
    { key: "value", header: "Value", align: "right", sortable: true, cell: (r) => (
      <span><span className="font-semibold tabular-nums text-slate-900">{formatNumber(r.value)}</span> <span className="text-xs text-slate-400">{r.unit}</span></span>
    )},
    { key: "source", header: "Source", cell: (r) => <Badge size="sm" variant="outline">{r.source}</Badge> },
    { key: "status", header: "Status", cell: (r) => <Badge size="sm" variant="outline" className={cn(STATUS_COLORS[r.status])}>{r.status}</Badge> },
    { key: "confidence", header: "Conf.", cell: (r) => r.confidence !== undefined ? <ConfidenceBadge value={r.confidence} /> : "—" },
    { key: "updatedAt", header: "Updated", cell: (r) => <span className="text-xs text-slate-500">{formatRelative(r.updatedAt)}</span> },
  ];
  return <DataTable data={events} columns={columns} onRowClick={onRowClick} rowKey={(r) => r.id} dense />;
}
