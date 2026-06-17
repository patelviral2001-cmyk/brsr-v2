"use client";

import Link from "next/link";
import { FileText, FileSpreadsheet, File as FileIcon, FilePieChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatRelative } from "@/lib/format";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { FileObject } from "@/types";

function getFileIcon(mime: string | undefined | null) {
  const m = mime ?? "";
  if (m.includes("spreadsheet") || m.includes("csv")) return FileSpreadsheet;
  if (m.includes("pdf")) return FileText;
  if (m.includes("image")) return FilePieChart;
  return FileIcon;
}

export function FileCard({ file }: { file: FileObject }) {
  const Icon = getFileIcon(file.mimeType);
  const isProcessing = file.status === "PROCESSING";
  const docType = file.docType ?? "UNKNOWN";
  const docTypeLabel = docType.replace(/_/g, " ");
  const extractedFieldCount = file.extractedFieldCount ?? 0;
  const avgConfidence = file.avgConfidence ?? 0;
  return (
    <Link href={`/files/${file.id}`} className="group block">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft transition-all hover:border-slate-300 hover:shadow-elevated">
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            docType === "INVOICE" && "bg-emerald-50 text-emerald-700",
            docType === "UTILITY_BILL" && "bg-sky-50 text-sky-700",
            docType === "FUEL_RECEIPT" && "bg-amber-50 text-amber-700",
            docType === "POLICY" && "bg-violet-50 text-violet-700",
            !["INVOICE", "UTILITY_BILL", "FUEL_RECEIPT", "POLICY"].includes(docType) && "bg-slate-50 text-slate-700"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-medium text-slate-900 group-hover:text-primary-800">{file.filename}</div>
            <div className="text-xs text-slate-500">{file.scopeNodeName}</div>
          </div>
          <Badge variant="outline" className={cn("shrink-0", file.status ? STATUS_COLORS[file.status] : "")}>
            {isProcessing && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
            {file.status ?? "UNKNOWN"}
          </Badge>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Badge variant="ghost" size="sm">{docTypeLabel}</Badge>
            <span>·</span>
            <span>{formatBytes(file.sizeBytes ?? 0)}</span>
          </div>
          {extractedFieldCount > 0 && (
            <div className="flex items-center gap-1.5">
              <ConfidenceRing pct={avgConfidence} />
              <span className="text-slate-500">{extractedFieldCount} fields</span>
            </div>
          )}
        </div>
        <div className="mt-3 text-[10px] text-slate-400">
          Uploaded {formatRelative(file.uploadedAt)} by {file.uploadedBy ?? "unknown"}
        </div>
      </div>
    </Link>
  );
}

function ConfidenceRing({ pct }: { pct: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const color = pct >= 0.9 ? "#059669" : pct >= 0.75 ? "#0ea5e9" : pct >= 0.6 ? "#d97706" : "#e11d48";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
      <circle cx="10" cy="10" r={r} stroke="#e2e8f0" strokeWidth={2} fill="none" />
      <circle cx="10" cy="10" r={r} stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} fill="none" />
    </svg>
  );
}
