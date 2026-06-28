"use client";

import { FileText, ScanLine, Database, Calculator, FileBarChart2, ArrowRight, ShieldCheck } from "lucide-react";

const STEPS = [
  { id: "doc", label: "Source Document", icon: FileText, ref: "BESCOM_April2025_BLR-HQ.pdf", meta: "PDF · 412 KB · uploaded 16 Apr 2025" },
  { id: "ext", label: "Extracted Field", icon: ScanLine, ref: "electricity.units_kwh = 142,330", meta: "Confidence 96% · OCR/LLM/Schema verified" },
  { id: "metric", label: "Metric Event", icon: Database, ref: "electricity.consumption.kwh (FY24-25 / BLR HQ)", meta: "Approved by Arjun Menon · 18 Apr 2025" },
  { id: "calc", label: "Calculation Run", icon: Calculator, ref: "ghg.scope2.location.tco2e = 14,220.8 tCO2e", meta: "CEL formula · EF: CEA 0.769 kgCO2e/kWh" },
  { id: "report", label: "Reported In", icon: FileBarChart2, ref: "BRSR FY24-25 → P6 Q5", meta: "Filed with SEBI on 30 May 2026" },
  { id: "assured", label: "Assurance Opinion", icon: ShieldCheck, ref: "Unqualified — KPMG India", meta: "Signed 28 May 2026 · Root hash sealed" },
];

export function WalkthroughViewer() {
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase text-slate-400">Audit trail · metric ghg.scope2.location.tco2e</div>
      <ol className="relative space-y-3 border-l border-slate-200 pl-6">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.id} className="relative">
              <span className="absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary-50 text-primary-700 shadow-soft">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-elevated">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Step {i + 1}</div>
                    <div className="text-sm font-semibold text-slate-900">{step.label}</div>
                  </div>
                  <button className="text-xs text-primary-700 hover:underline">Open →</button>
                </div>
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{step.ref}</div>
                <div className="mt-1 text-[10px] text-slate-500">{step.meta}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
