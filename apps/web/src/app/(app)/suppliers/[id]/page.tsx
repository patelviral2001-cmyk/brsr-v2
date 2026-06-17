"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { SupplierScorecardRadar } from "@/components/charts/supplier-scorecard-radar";
import { useSupplier } from "@/lib/api/queries";
import { formatINR, formatTonnesCO2e, formatRelative } from "@/lib/format";
import { Send, ShieldCheck } from "lucide-react";

export default function SupplierDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { data: s } = useSupplier(id);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={s?.name ?? "Supplier"}
        description={s ? `${s.category} · ${s.country} · Tier ${s.tier}` : "Loading…"}
        actions={
          <>
            <Button variant="outline" size="sm"><Send className="h-4 w-4" />Send Questionnaire</Button>
            <Button size="sm"><ShieldCheck className="h-4 w-4" />Mark Verified</Button>
          </>
        }
      />

      {s && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Scorecard</CardTitle>
                <CardDescription>Composite ESG score: <span className="font-semibold text-slate-900">{s.esgScore}</span></CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <div className="h-64 w-64">
                  <SupplierScorecardRadar data={s.scorecard} size={256} />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Risk & Status</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Row label="Risk Level"><Badge variant={s.riskLevel === "CRITICAL" ? "danger" : s.riskLevel === "HIGH" ? "warning" : "success"}>{s.riskLevel}</Badge></Row>
                  <Row label="Questionnaire"><Badge variant={s.questionnaireStatus === "COMPLETED" ? "success" : "outline"}>{s.questionnaireStatus}</Badge></Row>
                  {s.lastResponseAt && <Row label="Last Response"><span className="text-xs text-slate-700">{formatRelative(s.lastResponseAt)}</span></Row>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Scope 3 contribution</CardTitle></CardHeader>
                <CardContent>
                  <Row label="Spend"><span className="font-semibold tabular-nums">{formatINR(s.spendINR, { compact: true })}</span></Row>
                  <Row label="Cat 1 emissions"><span className="font-semibold tabular-nums">{formatTonnesCO2e(s.scope3ContributionTCO2e, { compact: true })}</span></Row>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Questionnaire Responses</CardTitle>
              <CardDescription>Latest CDP Climate + custom BRSR pulse</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Qa q="Do you have a public 1.5°C-aligned net-zero target?" a={s.esgScore > 75 ? "Yes — SBTi validated 2024" : "Under preparation"} ok={s.esgScore > 75} />
                <Qa q="Share of renewable electricity in operations" a={s.esgScore > 75 ? "84%" : "32%"} ok={s.esgScore > 75} />
                <Qa q="Modern slavery / forced labour audit (Tier-2 visibility)" a={s.esgScore > 60 ? "Yes, last 12 months" : "Partial coverage"} ok={s.esgScore > 60} />
                <Qa q="Recordable injury rate (per 1M hrs)" a={s.esgScore > 70 ? "0.21" : "0.84"} ok={s.esgScore > 70} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between py-1 text-xs"><span className="text-slate-500">{label}</span><span>{children}</span></div>;
}

function Qa({ q, a, ok }: { q: string; a: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{q}</div>
      <div className={`mt-1 text-sm font-medium ${ok ? "text-emerald-700" : "text-amber-700"}`}>{a}</div>
    </div>
  );
}
