"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { BRSRSection } from "@/types";

export function BRSRSectionTree({ sections, activeId, onSelect }: { sections: BRSRSection[]; activeId?: string; onSelect?: (id: string) => void }) {
  return (
    <div className="space-y-1">
      {sections.map((s) => {
        const pct = s.total > 0 ? Math.round((s.answered / s.total) * 100) : 0;
        const isActive = s.id === activeId;
        return (
          <button
            key={s.id}
            onClick={() => onSelect?.(s.id)}
            className={cn(
              "block w-full rounded-lg border p-3 text-left transition-all",
              isActive ? "border-primary-300 bg-primary-50" : "border-slate-200 bg-white hover:border-slate-300"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold",
                  isActive ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-700"
                )}>
                  {s.principle}
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-900">{s.title}</div>
                  <div className="text-[10px] text-slate-500">{s.answered} / {s.total} answered</div>
                </div>
              </div>
              <span className={cn("text-xs font-semibold tabular-nums", pct === 100 ? "text-emerald-700" : "text-slate-700")}>{pct}%</span>
            </div>
            <Progress value={pct} className="mt-2 h-1" />
          </button>
        );
      })}
    </div>
  );
}
