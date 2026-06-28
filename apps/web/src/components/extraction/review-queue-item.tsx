"use client";

import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import type { ExtractedField } from "@/types";

interface Props {
  field: ExtractedField;
  isActive: boolean;
  onSelect: () => void;
}

export function ReviewQueueItem({ field, isActive, onSelect }: Props) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        isActive ? "border-primary-300 bg-primary-50" : "border-slate-200 bg-white hover:bg-slate-50"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-medium text-slate-900">{field.fieldLabel}</div>
        <ConfidenceBadge value={field.confidence} />
      </div>
      <div className="mt-1 truncate text-[10px] text-slate-500">{field.fileName}</div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {typeof field.value === "number" ? field.value.toLocaleString("en-IN") : field.value}
        </span>
        {field.unit && <span className="text-[10px] text-slate-500">{field.unit}</span>}
      </div>
    </button>
  );
}
