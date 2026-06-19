"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useEvidence, useSites, useSuggestedKpis,
  useKpiByCode, useConfirmExtraction, useHoldEvidence,
  type Kpi as KpiType,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, PauseCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function EvidenceReviewPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const { data: evidence, isLoading } = useEvidence(id ?? null);
  const { data: sites = [] } = useSites();

  const extraction = evidence?.extractions?.[0];
  const schemaCode = extraction?.schemaCode ?? null;
  const { data: suggested } = useSuggestedKpis(schemaCode);
  const primaryKpiCode = suggested?.kpiCodes?.[0] ?? null;
  const { data: primaryKpi } = useKpiByCode(primaryKpiCode);

  const [siteId, setSiteId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [value, setValue] = useState<string>("");
  const [unit, setUnit] = useState<string>("");

  // Seed from evidence + extraction payload
  useEffect(() => {
    if (evidence) {
      setSiteId(evidence.siteId ?? "");
      setPeriodStart(evidence.hintPeriodStart?.slice(0, 10) ?? "");
      setPeriodEnd(evidence.hintPeriodEnd?.slice(0, 10) ?? "");
    }
  }, [evidence]);

  useEffect(() => {
    if (!extraction) return;
    const payload = extraction.payload as any;
    // Heuristic seed from common bill fields
    const numeric = (
      payload?.units_consumed_kwh ?? payload?.quantity_litres ??
      payload?.water_consumed_m3 ?? payload?.png_consumed_m3 ??
      payload?.value
    );
    if (numeric != null && value === "") setValue(String(numeric));

    if (primaryKpi?.unit && unit === "") setUnit(primaryKpi.unit);

    // Period from extractor
    if (payload?.period_start && !periodStart) setPeriodStart(String(payload.period_start).slice(0, 10));
    if (payload?.period_end && !periodEnd) setPeriodEnd(String(payload.period_end).slice(0, 10));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction, primaryKpi]);

  const confirm = useConfirmExtraction();
  const hold = useHoldEvidence();

  const canSubmit = !!siteId && !!periodStart && !!periodEnd && !!value && !!primaryKpiCode && !!unit;

  const handleConfirm = async () => {
    if (!canSubmit || !evidence || !primaryKpiCode) return;
    try {
      const payloadForKpi = buildKpiPayload(primaryKpi, value, unit);
      await confirm.mutateAsync({
        evidenceId: evidence.id,
        siteId,
        periodStart,
        periodEnd,
        dataPoints: [
          { kpiCode: primaryKpiCode, payload: payloadForKpi, confidence: extraction?.confidence ?? 0 },
        ],
      });
      toast.success("Saved data point");
      router.push("/evidence");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to confirm");
    }
  };

  const handleHold = async () => {
    if (!evidence) return;
    try {
      await hold.mutateAsync({ id: evidence.id, reason: "Reviewer placed on hold" });
      toast.success("Held for later review");
      router.push("/evidence");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to hold");
    }
  };

  // ⌨ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleConfirm();
        }
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
      if (e.key.toLowerCase() === "h") { handleHold(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const confidencePct = useMemo(() => {
    const c = extraction?.confidence ?? evidence?.classifierConfidence ?? 0;
    return Math.round(c * 100);
  }, [extraction, evidence]);

  if (isLoading || !evidence) {
    return (
      <div className="p-10 text-ink-500"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-300/50 bg-paper-0 px-6 py-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/evidence" className="flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
          </Link>
          <span className="text-ink-300">|</span>
          <div className="text-[14px] font-medium text-ink-900 truncate">{evidence.originalName}</div>
          <span className="text-ink-300">·</span>
          <span className="text-[13px] text-ink-500">{evidence.docType.replace(/_/g, " ").toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-ink-500">
          Press <kbd className="rounded border border-ink-300 bg-paper-50 px-1.5 py-0.5 text-[10px] font-mono text-ink-700">Enter</kbd>
          to confirm, <kbd className="rounded border border-ink-300 bg-paper-50 px-1.5 py-0.5 text-[10px] font-mono text-ink-700">H</kbd> to hold.
        </div>
      </div>

      {/* Split */}
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[55fr_45fr]">
        {/* LEFT — document preview */}
        <div className="bg-paper-50 border-r border-ink-300/50 overflow-hidden">
          {evidence.signedUrl ? (
            <iframe
              src={evidence.signedUrl}
              title={evidence.originalName}
              className="h-full w-full bg-paper-0"
            />
          ) : (
            <div className="grid place-items-center h-full text-ink-500 text-[13px]">No preview</div>
          )}
        </div>

        {/* RIGHT — extracted fields */}
        <div className="p-6 overflow-y-auto scrollbar-thin">
          <div className="space-y-5 max-w-[480px]">
            <FieldRow label="Site">
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full h-10 rounded-lg border border-ink-300 bg-paper-0 px-3 text-[14px] text-ink-900 focus-ring"
              >
                <option value="">— Pick a site —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FieldRow>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Period start">
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </FieldRow>
              <FieldRow label="Period end">
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </FieldRow>
            </div>

            <hr className="border-ink-300/50" />

            <FieldRow label={primaryKpi?.title ?? "KPI"}>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  className="font-mono tabular-nums text-right"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0"
                />
                <Input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="unit"
                  className="w-24 font-mono"
                />
                <ConfidenceDot pct={confidencePct} />
              </div>
              <div className="mt-1 text-[12px] text-ink-500">
                {primaryKpi ? <>KPI: <span className="font-mono">{primaryKpi.code}</span> · feeds {primaryKpi.topic.title}</> :
                  primaryKpiCode ? "Loading KPI…" : "No KPI suggestion available — pick manually later"}
              </div>
            </FieldRow>

            {/* Raw extracted payload for transparency */}
            {extraction && (
              <details className="text-[12px] text-ink-500">
                <summary className="cursor-pointer hover:text-ink-700">Show full extracted payload</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-paper-50 p-3 text-[11px] font-mono text-ink-700">
                  {JSON.stringify(extraction.payload, null, 2)}
                </pre>
              </details>
            )}

            <div className="flex gap-2 pt-4 border-t border-ink-300/50">
              <Button
                onClick={handleConfirm}
                disabled={!canSubmit || confirm.isPending}
                className="flex-1 bg-lime-500 hover:bg-lime-600 text-ink-900 font-medium"
              >
                {confirm.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Check className="h-4 w-4 mr-1" /> Confirm &amp; Save ↵</>}
              </Button>
              <Button variant="outline" onClick={handleHold} disabled={hold.isPending}>
                <PauseCircle className="h-4 w-4 mr-1" /> Hold
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] uppercase tracking-wider text-ink-500">{label}</Label>
      {children}
    </div>
  );
}

function ConfidenceDot({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-success" : pct >= 70 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[11px] text-ink-500 tabular-nums">{pct}%</span>
    </div>
  );
}

/** Convert reviewer (value, unit) to a payload that matches KPI.payloadKind. */
function buildKpiPayload(kpi: KpiType | undefined, valueStr: string, unit: string) {
  const v = Number(valueStr);
  const kind = kpi?.payloadKind ?? "QUANTITATIVE";
  if (kind === "QUANTITATIVE") return { value: v, unit };
  if (kind === "PROPORTION")  return { numerator: v, denominator: 100, unit: unit || "%" };
  return { value: v, unit };
}
