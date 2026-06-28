"use client";

import { Building2, Building, Factory, Briefcase, Users, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import type { HierarchyNode } from "@/types";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  GROUP: Building2,
  LEGAL_ENTITY: Building,
  BUSINESS_UNIT: Briefcase,
  SITE: Factory,
  DEPARTMENT: Users,
};

export function NodeCard({ node }: { node: HierarchyNode }) {
  const Icon = ICON[node.type] ?? Building2;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-900">{node.name}</h3>
              <Badge variant="outline">{node.type.replace("_", " ")}</Badge>
            </div>
            <div className="text-xs text-slate-500">{node.code}{node.cin ? ` · ${node.cin}` : ""}</div>
            {node.address && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3" />
                {node.address}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase text-slate-400">Employees</div>
            <div className="text-sm font-semibold text-slate-900">{node.employeeCount?.toLocaleString("en-IN") ?? "—"}</div>
          </div>
          {node.revenueINR !== undefined && (
            <div>
              <div className="text-[10px] uppercase text-slate-400">Revenue</div>
              <div className="text-sm font-semibold text-slate-900">{formatINR(node.revenueINR, { compact: true })}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase text-slate-400">Children</div>
            <div className="text-sm font-semibold text-slate-900">{node.children?.length ?? 0}</div>
          </div>
          {node.ownershipPct !== undefined && (
            <div>
              <div className="text-[10px] uppercase text-slate-400">Ownership</div>
              <div className="text-sm font-semibold text-slate-900">{node.ownershipPct}%</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
