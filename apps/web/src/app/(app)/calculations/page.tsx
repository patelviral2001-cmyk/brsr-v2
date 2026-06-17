"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { useCalculations } from "@/lib/api/queries";
import { formatNumber, formatRelative } from "@/lib/format";
import { Play, Plus } from "lucide-react";
import type { CalculationRun } from "@/types";

export default function CalculationsPage() {
  const { data: runs } = useCalculations();
  const cols: Column<CalculationRun>[] = [
    { key: "formulaName", header: "Formula", sortable: true, cell: (r) => (
      <Link href={`/calculations/${r.id}`} className="block">
        <div className="text-sm font-medium text-slate-900 hover:text-primary-800">{r.formulaName}</div>
        <code className="text-[10px] text-slate-500">{r.formulaKey}</code>
      </Link>
    )},
    { key: "scopeNodeName", header: "Scope", cell: (r) => <span className="text-xs text-slate-600">{r.scopeNodeName}</span> },
    { key: "fy", header: "FY", sortable: true, width: "80px" },
    { key: "result", header: "Result", align: "right", sortable: true, cell: (r) => (
      <span><span className="font-semibold tabular-nums text-slate-900">{r.result !== undefined ? formatNumber(r.result) : "—"}</span> <span className="text-xs text-slate-400">{r.unit}</span></span>
    )},
    { key: "durationMs", header: "Duration", align: "right", cell: (r) => <span className="text-xs text-slate-500">{r.durationMs}ms</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "SUCCESS" ? "success" : r.status === "RUNNING" ? "info" : "danger"} size="sm">{r.status}</Badge> },
    { key: "completedAt", header: "When", cell: (r) => <span className="text-xs text-slate-500">{r.completedAt ? formatRelative(r.completedAt) : "—"}</span> },
  ];
  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Calculations"
        description="CEL-based formula engine. Every run is reproducible, hashed, and auditable."
        actions={
          <>
            <Button variant="outline" size="sm"><Plus className="h-4 w-4" />New Formula</Button>
            <Button size="sm"><Play className="h-4 w-4" />Run All</Button>
          </>
        }
      />
      <Card>
        <CardContent className="p-0">
          <DataTable data={Array.isArray(runs) ? runs : []} columns={cols} rowKey={(r) => r.id} dense />
        </CardContent>
      </Card>
    </div>
  );
}
