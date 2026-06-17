"use client";

import { useState } from "react";
import { ChevronRight, Building2, Building, Factory, Briefcase, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HierarchyNode } from "@/types";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  GROUP: Building2,
  LEGAL_ENTITY: Building,
  BUSINESS_UNIT: Briefcase,
  SITE: Factory,
  DEPARTMENT: Users,
};

interface TreeViewProps {
  root: HierarchyNode;
  selectedId?: string;
  onSelect?: (node: HierarchyNode) => void;
}

export function TreeView({ root, selectedId, onSelect }: TreeViewProps) {
  return (
    <div className="space-y-0.5 text-sm">
      <TreeNode node={root} depth={0} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

function TreeNode({ node, depth, selectedId, onSelect }: { node: HierarchyNode; depth: number; selectedId?: string; onSelect?: (n: HierarchyNode) => void }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const Icon = ICON[node.type] ?? Building2;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 transition-colors hover:bg-slate-50",
          isSelected && "bg-primary-50"
        )}
        style={{ paddingLeft: depth * 16 + 4 }}
        onClick={() => onSelect?.(node)}
      >
        {hasChildren ? (
          <button
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-slate-100"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : <span className="w-5" />}
        <Icon className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary-700" : "text-slate-400")} />
        <span className={cn("flex-1 truncate", isSelected ? "font-medium text-primary-900" : "text-slate-700")}>{node.name}</span>
        {node.employeeCount !== undefined && (
          <span className="text-[10px] text-slate-400">{node.employeeCount.toLocaleString("en-IN")}</span>
        )}
      </div>
      {expanded && node.children?.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}
