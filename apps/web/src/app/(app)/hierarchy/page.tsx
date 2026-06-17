"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { TreeView } from "@/components/hierarchy/tree-view";
import { NodeCard } from "@/components/hierarchy/node-card";
import { OrgHierarchyRadial } from "@/components/charts/org-hierarchy-tree";
import { useHierarchy } from "@/lib/api/queries";
import { Plus, Upload, GitFork, Download, LayoutGrid, Network } from "lucide-react";
import type { HierarchyNode } from "@/types";

export default function HierarchyPage() {
  const { data: tree } = useHierarchy();
  const [selected, setSelected] = useState<HierarchyNode | null>(null);
  const [view, setView] = useState<"tree" | "radial">("tree");

  return (
    <div className="p-6">
      <PageHeader
        title="Entity Hierarchy"
        description="Group → Legal Entity → Site → Department. Drag-drop to reparent."
        actions={
          <>
            <Button variant="outline" size="sm"><Upload className="h-4 w-4" />Bulk Import (CSV)</Button>
            <Button variant="outline" size="sm"><Download className="h-4 w-4" />Export</Button>
            <Button size="sm"><Plus className="h-4 w-4" />Add Node</Button>
          </>
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="primary">{tree ? countNodes(tree) : 0} entities</Badge>
          <Badge variant="outline">4 levels</Badge>
          <Badge variant="outline">2 listed LEs</Badge>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          <button onClick={() => setView("tree")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${view === "tree" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
            <LayoutGrid className="h-3.5 w-3.5" /> Tree
          </button>
          <button onClick={() => setView("radial")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${view === "radial" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
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
              {tree && view === "tree" && <TreeView root={tree} selectedId={selected?.id} onSelect={setSelected} />}
              {tree && view === "radial" && (
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
                    <Stat label="Metric Events" value="248" />
                    <Stat label="Files" value="14" />
                    <Stat label="Pending Reviews" value="3" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Assigned Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {["Arjun Menon (Analyst)", "Priya Iyer (Group Head)", "Kavita Rao (Analyst)"].map((u) => (
                      <div key={u} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-[10px] font-semibold text-primary-700">
                          {u.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm text-slate-700">{u}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" size="sm"><GitFork className="h-4 w-4" />Reparent</Button>
                <Button variant="outline" size="sm">Edit</Button>
                <Button variant="outline" size="sm" className="text-rose-700">Archive</Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                <Network className="h-10 w-10 text-slate-300" />
                <h3 className="mt-3 text-base font-semibold text-slate-900">Select a node</h3>
                <p className="mt-1 text-sm text-slate-500">Click any entity on the left to see details and assigned users.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function countNodes(n: HierarchyNode): number {
  return 1 + (n.children?.reduce((a, c) => a + countNodes(c), 0) ?? 0);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
