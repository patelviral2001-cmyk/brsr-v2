"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatBytes, formatRelative } from "@/lib/format";
import { FormatIcons } from "./format-icons";
import type { Report } from "@/types";

export function ReportCard({ report }: { report: Report }) {
  return (
    <Link href={`/reports/${report.id}`} className="group block">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft transition-all hover:border-slate-300 hover:shadow-elevated">
        {/* Cover */}
        <div className="relative h-32 bg-gradient-to-br from-primary-700 via-primary-800 to-primary-950 p-4 text-white">
          <div className="absolute inset-0 grid-pattern opacity-10" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-wider text-primary-200">{report.frameworks.join(" · ")}</div>
            <div className="mt-1 line-clamp-2 text-base font-bold">{report.name}</div>
            <div className="mt-2 text-xs text-primary-200">{report.scopeNodeName} · {report.fy}</div>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={cn(STATUS_COLORS[report.status])}>
              {report.status === "ASSURED" && <ShieldCheck className="mr-1 h-3 w-3" />}
              {report.status}
            </Badge>
            <FormatIcons formats={report.formats} />
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Generated {report.generatedAt ? formatRelative(report.generatedAt) : "—"} by {report.generatedBy}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {formatBytes(report.sizeBytes)}
          </div>
        </div>
      </div>
    </Link>
  );
}
