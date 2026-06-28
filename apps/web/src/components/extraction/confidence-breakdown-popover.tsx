"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfidenceBadge } from "./confidence-badge";
import type { ConfidenceBreakdown } from "@/types";

interface Props {
  overall: number;
  breakdown: ConfidenceBreakdown;
}

const LABELS = [
  { key: "ocrQuality", label: "OCR Quality", desc: "Text recognition accuracy" },
  { key: "llmCertainty", label: "LLM Certainty", desc: "Model self-reported confidence" },
  { key: "schemaMatch", label: "Schema Match", desc: "Conformance to expected field schema" },
  { key: "historicalAgreement", label: "Historical Agreement", desc: "Consistency with prior periods" },
  { key: "crossReference", label: "Cross-Reference", desc: "Agreement with other documents" },
];

export function ConfidenceBreakdownPopover({ overall, breakdown }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button><ConfidenceBadge value={overall} /></button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Confidence breakdown</div>
          <ConfidenceBadge value={overall} />
        </div>
        <div className="space-y-2.5">
          {LABELS.map((l) => {
            const raw = breakdown?.[l.key as keyof ConfidenceBreakdown];
            const v = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
            const pct = Math.round(v * 100);
            const color = v >= 0.9 ? "bg-emerald-500" : v >= 0.75 ? "bg-sky-500" : v >= 0.6 ? "bg-amber-500" : "bg-rose-500";
            return (
              <div key={l.key}>
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-slate-700">{l.label}</div>
                    <div className="text-[10px] text-slate-400">{l.desc}</div>
                  </div>
                  <div className="font-semibold tabular-nums text-slate-900">{pct}%</div>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
