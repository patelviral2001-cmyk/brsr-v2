"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { FormulaDisplay } from "@/components/brsr/formula-display";
import { useCalculation } from "@/lib/api/queries";
import { formatNumber, formatDateTime } from "@/lib/format";

export default function CalculationRunPage() {
  const params = useParams();
  const id = String(params?.runId ?? "");
  const { data: run } = useCalculation(id);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={run?.formulaName ?? "Calculation"}
        description={run?.formulaKey}
        actions={run && <Badge variant={run.status === "SUCCESS" ? "success" : "warning"}>{run.status}</Badge>}
      />

      {run && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Inputs</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(Array.isArray(run.inputs) ? run.inputs : []).map((i) => (
                <div key={i.key} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <code className="text-xs text-slate-600">{i.key}</code>
                  <div><span className="font-semibold tabular-nums">{formatNumber(i.value)}</span> <span className="text-xs text-slate-400">{i.unit}</span></div>
                </div>
              ))}
              <div className="pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Formula</h4>
                <FormulaDisplay formula={run.formula ?? ""} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Result</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 text-center">
                <div className="text-3xl font-bold tabular-nums text-primary-900">{run.result !== undefined ? formatNumber(run.result) : "—"}</div>
                <div className="mt-1 text-sm text-primary-700">{run.unit}</div>
              </div>
              <dl className="mt-4 space-y-1.5 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Scope</dt><dd className="font-medium text-slate-900">{run.scopeNodeName}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Period</dt><dd className="font-medium text-slate-900">{run.fy}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Duration</dt><dd className="font-medium text-slate-900">{run.durationMs}ms</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Started</dt><dd className="font-medium text-slate-900">{formatDateTime(run.startedAt)}</dd></div>
                {run.completedAt && <div className="flex justify-between"><dt className="text-slate-500">Completed</dt><dd className="font-medium text-slate-900">{formatDateTime(run.completedAt)}</dd></div>}
              </dl>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
