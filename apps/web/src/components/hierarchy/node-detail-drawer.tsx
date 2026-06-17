"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { NodeCard } from "./node-card";
import type { HierarchyNode } from "@/types";

export function NodeDetailDrawer({ node, open, onOpenChange }: { node: HierarchyNode | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{node?.name ?? "Node"}</SheetTitle>
          <SheetDescription>{node?.code} · {node?.type}</SheetDescription>
        </SheetHeader>
        <div className="p-6">
          {node && <NodeCard node={node} />}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="primary">{node?.employeeCount ?? 0} employees</Badge>
            {node?.children && <Badge variant="outline">{node.children.length} children</Badge>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
