"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { DataTable, type Column } from "@/components/common/data-table";
import { useCalculations, useRunCalculation } from "@/lib/api/queries";
import { formatNumber, formatRelative } from "@/lib/format";
import { AlertTriangle, Calculator, Play, Plus } from "lucide-react";
import type { CalculationRun } from "@/types";
import { toast } from "sonner";
import { useScopeStore } from "@/stores/scope.store";

export default function CalculationsPage() {
  const { data: runs, isLoading, isError, error, refetch } = useCalculations();
  const runAll = useRunCalculation();
  const fy = useScopeStore((s) => s.fy);
  const scopeId = useScopeStore((s) => s.activeScopeId);

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
      <span>
        <span className="font-semibold tabular-nums text-slate-900">
          {r.result !== undefined && r.result !== null ? formatNumber(r.result) : "—"}
        </span>{" "}
        <span className="text-xs text-slate-400">{r.unit}</span>
      </span>
    )},
    { key: "durationMs", header: "Duration", align: "right", cell: (r) => <span className="text-xs text-slate-500">{r.durationMs ?? 0}ms</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "SUCCESS" ? "success" : r.status === "RUNNING" ? "info" : "danger"} size="sm">{r.status}</Badge> },
    { key: "completedAt", header: "When", cell: (r) => <span className="text-xs text-slate-500">{r.completedAt ? formatRelative(r.completedAt) : "—"}</span> },
  ];

  const handleRunAll = () => {
    runAll.mutate(
      { fy, scopeNodeId: scopeId },
      {
        onSuccess: () => toast.success("Run queued", { description: "We'll refresh the table once complete." }),
        onError: (err) => toast.error("Couldn't queue run", {
          description: err instanceof Error ? err.message : "Try again",
        }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Calculations" description="CEL-based formula engine. Every run is reproducible, hashed, and auditable." />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Calculations" description="CEL-based formula engine." />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load calculation runs"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  const list = Array.isArray(runs) ? runs : [];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Calculations"
        description="CEL-based formula engine. Every run is reproducible, hashed, and auditable."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info("New Formula", {
                  description: "Formula editor opens from Metrics → registry → 'Add formula'. Wizard ships in v2.1.",
                })
              }
              aria-label="Create new formula"
            >
              <Plus className="h-4 w-4" />New Formula
            </Button>
            <Button
              size="sm"
              onClick={handleRunAll}
              disabled={runAll.isPending}
              aria-label="Run all calculations"
            >
              <Play className="h-4 w-4" />{runAll.isPending ? "Running…" : "Run All"}
            </Button>
          </>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<Calculator className="h-6 w-6" />}
          title="No calculation runs yet"
          description="Click 'Run All' to compute current-period formulas."
          action={
            <Button onClick={handleRunAll} disabled={runAll.isPending}>
              <Play className="h-4 w-4" />Run All
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable data={list} columns={cols} rowKey={(r) => r.id} dense />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
