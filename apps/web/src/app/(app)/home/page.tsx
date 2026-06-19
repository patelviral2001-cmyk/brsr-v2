"use client";

import Link from "next/link";
import { useEvidenceList, useDataPoints, useSites } from "@/lib/api/queries";
import { ArrowRight, FileSearch, Database, AlertTriangle } from "lucide-react";

export default function HomePage() {
  const evidence = useEvidenceList();
  const dataPoints = useDataPoints();
  const sites = useSites();

  const evidenceList = evidence.data ?? [];
  const reviewQueue = evidenceList.filter((e) => e.status === "REVIEW_NEEDED").length;
  const failed = evidenceList.filter((e) => e.status === "FAILED").length;
  const confirmed = evidenceList.filter((e) => e.status === "CONFIRMED").length;
  const totalDP = dataPoints.data?.length ?? 0;

  return (
    <div className="max-w-[1200px] mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-[28px] font-semibold text-ink-900">Welcome back</h1>
        <span className="text-[13px] text-ink-500">{sites.data?.length ?? "—"} active sites</span>
      </div>

      {/* Attention */}
      <div className="rounded-2xl border border-ink-300/50 bg-paper-0 p-6 mb-8 shadow-soft">
        <h2 className="text-[14px] font-semibold text-ink-900 mb-4 uppercase tracking-wider">Attention</h2>
        <ul className="space-y-3">
          <Row icon={FileSearch}
               label={`${reviewQueue} document${reviewQueue === 1 ? "" : "s"} waiting for review`}
               href="/evidence" cta="Review now" />
          <Row icon={Database}
               label={`${totalDP} data point${totalDP === 1 ? "" : "s"} confirmed this FY`}
               href="/data-hub" cta="Open Data Hub" />
          {failed > 0 && (
            <Row icon={AlertTriangle}
                 label={`${failed} upload${failed === 1 ? "" : "s"} failed extraction`}
                 href="/evidence?status=FAILED" cta="Inspect"
                 danger />
          )}
        </ul>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Sites"            value={sites.data?.length} />
        <Kpi label="Evidence files"   value={evidenceList.length} />
        <Kpi label="Data points"      value={totalDP} />
        <Kpi label="Confirmed bills"  value={confirmed} />
      </div>
    </div>
  );
}

function Row({
  icon: Icon, label, href, cta, danger,
}: { icon: any; label: string; href: string; cta: string; danger?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-paper-50 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={`h-4 w-4 ${danger ? "text-danger" : "text-lime-700"}`} />
        <span className="text-[14px] text-ink-900 truncate">{label}</span>
      </div>
      <Link
        href={href}
        className="flex items-center gap-1 text-[13px] text-ink-700 hover:text-ink-900 font-medium shrink-0"
      >
        {cta} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}

function Kpi({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-ink-300/50 bg-paper-0 p-5 shadow-soft">
      <div className="text-[12px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-2 text-[28px] font-semibold text-ink-900 font-mono tabular-nums">{value ?? "—"}</div>
    </div>
  );
}
