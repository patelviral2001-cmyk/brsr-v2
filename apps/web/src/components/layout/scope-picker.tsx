"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Building2, Building, Factory, Briefcase, Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScopeStore } from "@/stores/scope.store";
import { useHierarchy } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import type { HierarchyNode } from "@/types";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  GROUP: Building2,
  LEGAL_ENTITY: Building,
  BUSINESS_UNIT: Briefcase,
  SITE: Factory,
  DEPARTMENT: Users,
};

export function ScopePicker() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: tree } = useHierarchy();
  const setScope = useScopeStore((s) => s.setScope);
  const activeId = useScopeStore((s) => s.activeScopeId);
  const breadcrumb = useScopeStore((s) => s.breadcrumb);

  const select = (path: HierarchyNode[]) => {
    const node = path[path.length - 1];
    setScope(node.id, node.name, path.map((n) => ({ id: n.id, name: n.name, type: n.type })));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 max-w-[480px] gap-1 px-2 text-xs">
          <Building2 className="h-3.5 w-3.5 text-primary-700" />
          <span className="hidden truncate sm:inline">
            {breadcrumb.map((b, i) => (
              <span key={b.id}>
                {i > 0 && <span className="mx-1 text-slate-300">/</span>}
                <span className={i === breadcrumb.length - 1 ? "font-medium text-slate-900" : "text-slate-500"}>{b.name}</span>
              </span>
            ))}
          </span>
          <span className="sm:hidden">Scope</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0">
        <div className="border-b border-slate-200 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entities…" className="h-9 pl-8" />
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          <div className="p-2">
            {tree && <TreeNode node={tree} path={[tree]} activeId={activeId} onSelect={select} query={q.toLowerCase()} />}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function TreeNode({ node, path, activeId, onSelect, query, depth = 0 }: { node: HierarchyNode; path: HierarchyNode[]; activeId: string; onSelect: (p: HierarchyNode[]) => void; query: string; depth?: number; }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const Icon = ICON[node.type] ?? Building2;
  const matches = !query || (node.name ?? "").toLowerCase().includes(query);
  const children = node.children ?? [];

  return (
    <div>
      {matches && (
        <div
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-50",
            activeId === node.id && "bg-primary-50"
          )}
          style={{ paddingLeft: depth * 12 + 6 }}
        >
          {children.length > 0 ? (
            <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="flex h-4 w-4 items-center justify-center rounded hover:bg-slate-100">
              <ChevronRight className={cn("h-3 w-3 text-slate-400 transition-transform", expanded && "rotate-90")} />
            </button>
          ) : <span className="w-4" />}
          <button onClick={() => onSelect(path)} className="flex flex-1 items-center gap-2 py-0.5 text-left">
            <Icon className={cn("h-3.5 w-3.5 shrink-0", activeId === node.id ? "text-primary-700" : "text-slate-400")} />
            <span className={cn("flex-1 truncate text-sm", activeId === node.id ? "font-medium text-primary-900" : "text-slate-700")}>{node.name}</span>
            {node.employeeCount && (
              <span className="text-[10px] text-slate-400">{node.employeeCount.toLocaleString("en-IN")} FTE</span>
            )}
          </button>
        </div>
      )}
      {expanded && children.map((c) => (
        <TreeNode key={c.id} node={c} path={[...path, c]} activeId={activeId} onSelect={onSelect} query={query} depth={depth + 1} />
      ))}
    </div>
  );
}
