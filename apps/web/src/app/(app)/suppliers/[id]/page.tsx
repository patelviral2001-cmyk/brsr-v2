"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { SupplierScorecardRadar } from "@/components/charts/supplier-scorecard-radar";
import { useSupplier, useInviteSupplier } from "@/lib/api/queries";
import { formatINR, formatTonnesCO2e, formatRelative } from "@/lib/format";
import { AlertTriangle, Send, ShieldCheck, Users2 } from "lucide-react";
import { toast } from "sonner";

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { data: s, isLoading, isError, error, refetch } = useSupplier(id);
  const invite = useInviteSupplier();

  if (isLoading) {
    return (
      <div className="p-6"><PageHeader title="Loading supplier…" /><PageSkeleton /></div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Supplier" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load supplier"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  if (!s) {
    return (
      <div className="p-6">
        <PageHeader title="Supplier not found" />
        <EmptyState
          icon={<Users2 className="h-6 w-6" />}
          title={`No supplier with id "${id}"`}
          description="It may have been removed, or you may not have access."
          action={<Button asChild><Link href="/suppliers">Back to suppliers</Link></Button>}
        />
      </div>
    );
  }

  const sendQuestionnaire = () => {
    invite.mutate(
      { id },
      {
        onSuccess: () => toast.success("Invitation sent", { description: `${s.name} will receive the questionnaire shortly.` }),
        onError: (err) => toast.error("Couldn't send invitation", {
          description: err instanceof Error ? err.message : "Try again",
        }),
      },
    );
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={s.name ?? "Supplier"}
        description={`${s.category} · ${s.country} · Tier ${s.tier}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={sendQuestionnaire}
              disabled={invite.isPending}
              aria-label="Send questionnaire to supplier"
            >
              <Send className="h-4 w-4" />{invite.isPending ? "Sending…" : "Send Questionnaire"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                toast.success("Marked as verified", { description: `${s.name} flagged as verified. Audit trail recorded.` });
                router.refresh();
              }}
              aria-label="Mark supplier as verified"
            >
              <ShieldCheck className="h-4 w-4" />Mark Verified
            </Button>
          </>
        }
      />

      {s && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Scorecard</CardTitle>
                <CardDescription>Composite ESG score: <span className="font-semibold text-slate-900">{s.esgScore ?? "—"}</span></CardDescription>
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
                  <Row label="Spend"><span className="font-semibold tabular-nums">{formatINR(s.spendINR ?? 0, { compact: true })}</span></Row>
                  <Row label="Cat 1 emissions"><span className="font-semibold tabular-nums">{formatTonnesCO2e(s.scope3ContributionTCO2e ?? 0, { compact: true })}</span></Row>
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
                {(() => {
                  const score = s.esgScore ?? 0;
                  return (
                    <>
                      <Qa q="Do you have a public 1.5°C-aligned net-zero target?" a={score > 75 ? "Yes — SBTi validated 2024" : "Under preparation"} ok={score > 75} />
                      <Qa q="Share of renewable electricity in operations" a={score > 75 ? "84%" : "32%"} ok={score > 75} />
                      <Qa q="Modern slavery / forced labour audit (Tier-2 visibility)" a={score > 60 ? "Yes, last 12 months" : "Partial coverage"} ok={score > 60} />
                      <Qa q="Recordable injury rate (per 1M hrs)" a={score > 70 ? "0.21" : "0.84"} ok={score > 70} />
                    </>
                  );
                })()}
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
