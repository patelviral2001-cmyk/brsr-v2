"use client";

import { cn } from "@/lib/utils";

export function ConfidenceBadge({ value, className }: { value: number; className?: string }) {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const pct = Math.round(v * 100);
  const color = v >= 0.9 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : v >= 0.75 ? "bg-sky-50 text-sky-700 border-sky-200"
    : v >= 0.6 ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", color, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {pct}%
    </span>
  );
}
