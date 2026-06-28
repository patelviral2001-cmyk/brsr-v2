"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { TreeView } from "@/components/hierarchy/tree-view";
import { NodeCard } from "@/components/hierarchy/node-card";
import { OrgHierarchyRadial } from "@/components/charts/org-hierarchy-tree";
import { useHierarchy } from "@/lib/api/queries";
import { AlertTriangle, Plus, Upload, GitFork, Download, LayoutGrid, Network } from "lucide-react";
import type { HierarchyNode } from "@/types";
import { toast } from "sonner";

export default function HierarchyPage() {
  const { data: tree, isLoading, isError, error, refetch, isFetching } = useHierarchy();
  const [selected, setSelected] = useState<HierarchyNode | null>(null);
  const [view, setView] = useState<"tree" | "radial">("tree");

  const handleBulkImport = () =>
    toast.info("Bulk import (CSV)", {
      description: "Drop a CSV under Files → Upload, choose 'Hierarchy CSV' as doc type. Bulk-import UI ships in v2.1.",
    });
  const handleExport = () => {
    if (!tree) {
      toast.warning("Nothing to export yet.");
      return;
    }
    try {
      const blob = new Blob([JSON.stringify(tree, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hierarchy-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Hierarchy exported as JSON");
    } catch (err) {
      toast.error("Export failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };
  const handleAddNode = () =>
    toast.info("Add Node", {
      description: "Select a parent on the left, then 'Add child' from its detail panel (coming in v2.1).",
    });

  if (isLoading) {
    return (
      <div className="p-6">
        <PageHeader title="Entity Hierarchy" description="Group → Legal Entity → Site → Department" />
        <PageSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Entity Hierarchy" description="Group → Legal Entity → Site → Department" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load hierarchy"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()} disabled={isFetching}>Try again</Button>}
        />
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="p-6">
        <PageHeader title="Entity Hierarchy" description="Group → Legal Entity → Site → Department" />
        <EmptyState
          icon={<Network className="h-6 w-6" />}
          title="No hierarchy yet"
          description="Import your org structure to get started."
          action={<Button onClick={handleBulkImport}><Upload className="h-4 w-4" />Bulk import</Button>}
        />
      </div>
    );
  }

  const counts = countByType(tree);

  return (
    <div className="p-6">
      <PageHeader
        title="Entity Hierarchy"
        description="Group → Legal Entity → Site → Department. Drag-drop to reparent."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleBulkImport} aria-label="Bulk import via CSV">
              <Upload className="h-4 w-4" />Bulk Import (CSV)
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} aria-label="Export hierarchy">
              <Download className="h-4 w-4" />Export
            </Button>
            <Button size="sm" onClick={handleAddNode} aria-label="Add node">
              <Plus className="h-4 w-4" />Add Node
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="primary">{counts.total} entities</Badge>
          <Badge variant="outline">{counts.depth} levels</Badge>
          <Badge variant="outline">{counts.legalEntities} listed LEs</Badge>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          <button onClick={() => setView("tree")} aria-pressed={view === "tree"} aria-label="Tree view" className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${view === "tree" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
            <LayoutGrid className="h-3.5 w-3.5" /> Tree
          </button>
          <button onClick={() => setView("radial")} aria-pressed={view === "radial"} aria-label="Radial view" className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${view === "radial" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
            <Network className="h-3.5 w-3.5" /> Radial
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle>Structure</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[680px] overflow-y-auto scrollbar-thin">
              {view === "tree" && <TreeView root={tree} selectedId={selected?.id} onSelect={setSelected} />}
              {view === "radial" && (
                <div className="aspect-square w-full">
                  <OrgHierarchyRadial root={tree} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-7">
          {selected ? (
            <>
              <NodeCard node={selected} />

              <Card>
                <CardHeader>
                  <CardTitle>Metrics & Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Sub-entities" value={String((selected.children?.length ?? 0))} />
                    <Stat label="FTE" value={(selected.employeeCount ?? 0).toLocaleString("en-IN")} />
                    <Stat label="Type" value={selected.type ?? "—"} />
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => toast.info("Reparent", { description: "Drag this node to a new parent in the tree, then save." })}>
                  <GitFork className="h-4 w-4" />Reparent
                </Button>
                <Button variant="outline" size="sm" onClick={() => toast.info("Edit node", { description: "Inline edit ships in v2.1 — use Bulk Import for now." })}>
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="text-rose-700" onClick={() => toast.warning("Archive node", { description: `'${selected.name}' would be archived. Confirmation flow ships in v2.1.` })}>
                  Archive
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                <Network className="h-10 w-10 text-slate-300" />
                <h3 className="mt-3 text-base font-semibold text-slate-900">Select a node</h3>
                <p className="mt-1 text-sm text-slate-500">Click any entity on the left to see details.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

interface HierarchyCounts {
  total: number;
  depth: number;
  legalEntities: number;
}

function countByType(n: HierarchyNode, depth = 1): HierarchyCounts {
  const childResults = (n.children ?? []).map((c) => countByType(c, depth + 1));
  const total = 1 + childResults.reduce((a, c) => a + c.total, 0);
  const maxChildDepth = childResults.reduce((a, c) => Math.max(a, c.depth), depth);
  const legalEntities =
    (n.type === "LEGAL_ENTITY" ? 1 : 0) +
    childResults.reduce((a, c) => a + c.legalEntities, 0);
  return { total, depth: maxChildDepth, legalEntities };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
