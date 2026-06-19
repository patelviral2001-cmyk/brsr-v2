"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useEvidenceList, useUploadEvidence, useSites } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const DOC_TYPES = [
  { code: "ELECTRICITY_BILL", label: "Electricity bill" },
  { code: "DIESEL_BILL",      label: "Diesel bill" },
  { code: "WATER_BILL",       label: "Water bill" },
  { code: "PNG_BILL",         label: "PNG / Gas bill" },
  { code: "UNKNOWN",          label: "Other (auto-detect)" },
];

export default function EvidencePage() {
  const { data: evidence = [], isLoading } = useEvidenceList();
  const { data: sites = [] } = useSites();
  const upload = useUploadEvidence();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [docType, setDocType] = useState("ELECTRICITY_BILL");
  const [siteId, setSiteId] = useState<string | "">("");

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync({ file, docTypeHint: docType, siteId: siteId || undefined });
        toast.success(`Uploaded ${file.name}`);
      } catch (e: any) {
        toast.error(`Failed: ${e?.message ?? "upload error"}`);
      }
    }
  };

  const review = evidence.filter((e) => e.status === "REVIEW_NEEDED");
  const inflight = evidence.filter((e) => ["PENDING", "CLASSIFIED"].includes(e.status));
  const confirmed = evidence.filter((e) => e.status === "CONFIRMED");
  const failed = evidence.filter((e) => ["FAILED", "REJECTED"].includes(e.status));

  return (
    <div className="max-w-[1200px] mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-[28px] font-semibold text-ink-900">Evidence</h1>
        <span className="text-[13px] text-ink-500">{evidence.length} files</span>
      </div>

      {/* Upload card */}
      <div className="rounded-2xl border border-ink-300/50 bg-paper-0 p-6 mb-8 shadow-soft">
        <h2 className="text-[14px] font-semibold text-ink-900 mb-4 uppercase tracking-wider">Upload</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-500">Document type</label>
            <select
              className="h-10 rounded-lg border border-ink-300 bg-paper-0 px-3 text-[14px] text-ink-900 focus-ring"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOC_TYPES.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-500">Site (optional — confirm on review)</label>
            <select
              className="h-10 rounded-lg border border-ink-300 bg-paper-0 px-3 text-[14px] text-ink-900 focus-ring"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              <option value="">— Auto / pick later —</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            className="bg-lime-500 hover:bg-lime-600 text-ink-900 font-medium"
          >
            {upload.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading…</>
              : <><Upload className="h-4 w-4 mr-2" /> Choose files</>}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Queues */}
      <section className="space-y-8">
        <Queue title="Ready to review" subtitle="Review extracted data and confirm." rows={review} />
        <Queue title="Extracting…"      subtitle="AI engine is processing these files." rows={inflight} muted />
        <Queue title="Confirmed"        subtitle="Already converted to data points." rows={confirmed} muted />
        {failed.length > 0 && <Queue title="Failed" subtitle="Extraction did not succeed." rows={failed} danger />}
        {isLoading && <p className="text-ink-500 text-[14px]">Loading…</p>}
      </section>
    </div>
  );
}

function Queue({
  title, subtitle, rows, muted, danger,
}: { title: string; subtitle: string; rows: any[]; muted?: boolean; danger?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink-900">{title} <span className="text-ink-500 font-normal">· {rows.length}</span></h3>
          <p className="text-[12px] text-ink-500">{subtitle}</p>
        </div>
      </div>
      <ul className="rounded-2xl border border-ink-300/50 bg-paper-0 divide-y divide-ink-300/50 shadow-soft">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-ink-900 truncate">{r.originalName}</div>
              <div className="text-[12px] text-ink-500 flex items-center gap-2">
                <span>{r.docType.replace(/_/g, " ").toLowerCase()}</span>
                {r.site && <span>· {r.site.name}</span>}
                <span>· {new Date(r.uploadedAt).toLocaleDateString()}</span>
                {typeof r.classifierConfidence === "number" && (
                  <span>· {Math.round(r.classifierConfidence * 100)}%</span>
                )}
              </div>
            </div>
            <Link
              href={`/evidence/${r.id}`}
              className={`flex items-center gap-1 text-[13px] font-medium ${
                danger ? "text-danger" : muted ? "text-ink-500" : "text-ink-900 hover:text-lime-700"
              }`}
            >
              {muted ? "Open" : "Review"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
