"use client";

import { ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Report } from "@/types";

export function ReportCoverPreview({ report }: { report: Report }) {
  return (
    <div className="aspect-[1/1.2] w-full max-w-md rounded-xl border border-slate-200 bg-gradient-to-br from-primary-700 to-primary-950 p-8 text-white shadow-elevated">
      <div className="flex h-full flex-col">
        <div className="text-[10px] uppercase tracking-widest text-primary-200">{report.frameworks.join(" · ")}</div>
        <h1 className="mt-3 text-3xl font-bold leading-tight">{report.name}</h1>
        <div className="mt-2 text-sm text-primary-200">{report.scopeNodeName}</div>
        <div className="flex-1" />
        <div className="text-xs text-primary-200">Generated {report.generatedAt ? formatDateTime(report.generatedAt) : "—"}</div>
        <div className="text-xs text-primary-200">{report.generatedBy}</div>
        {report.assuredBy && (
          <div className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] backdrop-blur">
            <ShieldCheck className="h-3 w-3" /> Assured by {report.assuredBy}
          </div>
        )}
      </div>
    </div>
  );
}
