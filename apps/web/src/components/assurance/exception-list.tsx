"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { AssuranceException } from "@/types";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "bg-rose-500", HIGH: "bg-orange-500", MEDIUM: "bg-amber-500", LOW: "bg-sky-500", INFO: "bg-slate-400",
};

export function ExceptionList({ exceptions }: { exceptions: AssuranceException[] }) {
  return (
    <div className="space-y-2">
      {exceptions.map((e) => (
        <div key={e.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_COLOR[e.severity]}`} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{e.metricName}</span>
              <Badge variant="outline" size="sm">{e.severity}</Badge>
              <Badge size="sm" variant={e.status === "RESOLVED" ? "success" : e.status === "RESPONDED" ? "info" : "warning"}>{e.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-600">{e.description}</p>
            <div className="mt-1.5 text-[10px] text-slate-400">{formatDate(e.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
