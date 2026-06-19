"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useDataPoints, useSites, useTopics } from "@/lib/api/queries";
import { ArrowRight } from "lucide-react";

export default function DataHubPage() {
  const { data: dps = [], isLoading } = useDataPoints();
  const { data: sites = [] } = useSites();
  const { data: topics = [] } = useTopics();

  const [siteId, setSiteId] = useState<string>("");
  const [topicCode, setTopicCode] = useState<string>("");

  const filtered = useMemo(() => {
    return dps.filter((d) =>
      (!siteId || d.siteId === siteId) &&
      (!topicCode || d.kpi?.topic.code === topicCode),
    );
  }, [dps, siteId, topicCode]);

  return (
    <div className="max-w-[1200px] mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-[28px] font-semibold text-ink-900">Data Hub</h1>
        <span className="text-[13px] text-ink-500">{filtered.length} data points</span>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="h-9 rounded-lg border border-ink-300 bg-paper-0 px-3 text-[13px] focus-ring"
        >
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={topicCode}
          onChange={(e) => setTopicCode(e.target.value)}
          className="h-9 rounded-lg border border-ink-300 bg-paper-0 px-3 text-[13px] focus-ring"
        >
          <option value="">All ESG topics</option>
          {topics.map((t) => <option key={t.code} value={t.code}>{t.title}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border border-ink-300/50 bg-paper-0 shadow-soft overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper-50 text-[12px] uppercase tracking-wider text-ink-500">
            <tr>
              <th className="text-left px-4 py-3">KPI</th>
              <th className="text-left px-4 py-3">Site</th>
              <th className="text-left px-4 py-3">Period</th>
              <th className="text-right px-4 py-3">Value</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="text-[14px] text-ink-900 divide-y divide-ink-300/50">
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-paper-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{d.kpi?.title ?? d.kpiId}</div>
                  <div className="text-[12px] text-ink-500 font-mono">{d.kpi?.code}</div>
                </td>
                <td className="px-4 py-3">{d.site?.name ?? "—"}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-[13px]">
                  {d.periodStart.slice(0, 10)} → {d.periodEnd.slice(0, 10)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatValue(d.payload)} {d.kpi?.unit ?? ""}
                </td>
                <td className="px-4 py-3">
                  <SourceBadge source={d.source} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/data-hub/${d.id}`} className="inline-flex items-center gap-1 text-[13px] text-ink-700 hover:text-lime-700">
                    Audit trail <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-ink-500 py-12">No data points yet. Upload an Evidence file to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatValue(payload: Record<string, unknown>): string {
  if (!payload) return "—";
  const v = payload.value ?? payload.numerator;
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : String(v);
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    EXTRACTED:  "bg-lime-50 text-lime-700",
    MANUAL:     "bg-info-50 text-info",
    API_IMPORT: "bg-paper-50 text-ink-500",
    CALCULATED: "bg-success-50 text-success",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${map[source] ?? "bg-paper-50 text-ink-500"}`}>
      {source.toLowerCase()}
    </span>
  );
}
