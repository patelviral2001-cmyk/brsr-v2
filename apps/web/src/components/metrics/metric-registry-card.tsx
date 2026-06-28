"use client";

import { Badge } from "@/components/ui/badge";
import { FrameworkBadges } from "./framework-badges";
import type { MetricDefinition } from "@/types";

export function MetricRegistryCard({ metric, onClick }: { metric: MetricDefinition; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-soft transition-all hover:border-slate-300 hover:shadow-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{metric.canonicalKey}</code>
            <Badge size="sm" variant={metric.computeKind === "DERIVED" ? "purple" : metric.computeKind === "EXTRACTED" ? "info" : "default"}>
              {metric.computeKind}
            </Badge>
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-slate-900 group-hover:text-primary-800">{metric.name}</h4>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{metric.description}</p>
        </div>
        <Badge variant="outline" size="sm">{metric.unit}</Badge>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <FrameworkBadges frameworks={metric.frameworks} max={3} />
        <span className="text-[10px] text-slate-400">{metric.dimensions.length} dim{metric.dimensions.length === 1 ? "" : "s"}</span>
      </div>
    </button>
  );
}
