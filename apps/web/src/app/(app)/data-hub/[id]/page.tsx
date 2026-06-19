"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useDataPointLineage } from "@/lib/api/queries";
import { ArrowLeft, FileText, Database, Sparkles } from "lucide-react";

export default function DataPointDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data, isLoading } = useDataPointLineage(id ?? null);

  if (isLoading || !data) {
    return <div className="p-10 text-ink-500">Loading…</div>;
  }
  const dp = data.dataPoint;
  return (
    <div className="max-w-[900px] mx-auto px-8 py-10">
      <Link href="/data-hub" className="inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-900 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Data Hub
      </Link>

      <h1 className="text-[24px] font-semibold text-ink-900 mb-1">{dp.kpi?.title ?? dp.kpiId}</h1>
      <p className="text-[13px] text-ink-500 mb-6">
        <span className="font-mono">{dp.kpi?.code}</span> · {dp.kpi?.topic.title} · {dp.fy}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <Card label="Site" value={dp.site?.name ?? "Entity-level"} />
        <Card label="Period" value={`${dp.periodStart.slice(0,10)} → ${dp.periodEnd.slice(0,10)}`} mono />
        <Card label="Value"
              value={`${formatValue(dp.payload)} ${dp.kpi?.unit ?? ""}`}
              mono large />
        <Card label="Source" value={dp.source.toLowerCase()} />
      </div>

      {/* Lineage */}
      <h2 className="text-[14px] font-semibold text-ink-900 uppercase tracking-wider mb-3">Audit trail</h2>
      <ol className="border-l-2 border-lime-500 ml-3 pl-6 space-y-6">
        {data.evidence && (
          <Node icon={FileText} title="Evidence uploaded" body={data.evidence.originalName}
                meta={`${data.evidence.docType.replace(/_/g, " ").toLowerCase()} · ${new Date(data.evidence.uploadedAt).toLocaleString()}`} />
        )}
        {data.extraction && (
          <Node icon={Sparkles} title="AI extraction" body={`Schema: ${data.extraction.schemaCode}`}
                meta={`Confidence ${Math.round((data.extraction.confidence ?? 0) * 100)}% · ${new Date(data.extraction.createdAt).toLocaleString()}`} />
        )}
        <Node icon={Database} title="Data point created" body={`${dp.kpi?.title ?? dp.kpiId} = ${formatValue(dp.payload)} ${dp.kpi?.unit ?? ""}`}
              meta={`${new Date(dp.submittedAt).toLocaleString()}`} />
        {data.auditTrail.map((a) => (
          <li key={a.id} className="-ml-9 pl-9 list-none">
            <div className="text-[13px] text-ink-700 font-medium">{a.action} <span className="text-ink-500">on {a.entityType}</span></div>
            <div className="text-[12px] text-ink-500">{new Date(a.createdAt).toLocaleString()}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Card({ label, value, mono, large }: { label: string; value: string; mono?: boolean; large?: boolean }) {
  return (
    <div className="rounded-2xl border border-ink-300/50 bg-paper-0 p-4 shadow-soft">
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`mt-1 text-ink-900 ${large ? "text-[22px] font-semibold" : "text-[15px]"} ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Node({ icon: Icon, title, body, meta }: { icon: any; title: string; body: string; meta: string }) {
  return (
    <li className="-ml-9 pl-9 list-none relative">
      <span className="absolute left-[-7px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-lime-500" />
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-900">
        <Icon className="h-3.5 w-3.5 text-lime-700" /> {title}
      </div>
      <div className="text-[14px] text-ink-700 mt-0.5">{body}</div>
      <div className="text-[12px] text-ink-500 mt-0.5">{meta}</div>
    </li>
  );
}

function formatValue(payload: any): string {
  if (!payload) return "—";
  const v = payload.value ?? payload.numerator;
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : String(v);
}
