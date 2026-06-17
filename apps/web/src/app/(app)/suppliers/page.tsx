"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { SupplierScorecardRadar } from "@/components/charts/supplier-scorecard-radar";
import { useSuppliers } from "@/lib/api/queries";
import { formatINR, formatTonnesCO2e } from "@/lib/format";
import { Send, Plus, AlertTriangle } from "lucide-react";
import type { Supplier } from "@/types";
import { useRouter } from "next/navigation";

export default function SuppliersPage() {
  const { data: suppliers } = useSuppliers();
  const router = useRouter();
  const critical = (suppliers ?? []).filter((s) => s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH").length;

  const cols: Column<Supplier>[] = [
    { key: "name", header: "Supplier", sortable: true, cell: (r) => (
      <div>
        <div className="text-sm font-medium text-slate-900">{r.name}</div>
        <div className="text-[10px] text-slate-500">{r.category} · {r.country}</div>
      </div>
    )},
    { key: "tier", header: "Tier", width: "60px", cell: (r) => <Badge variant="outline" size="sm">T{r.tier}</Badge> },
    { key: "spendINR", header: "Spend", align: "right", sortable: true, cell: (r) => <span className="text-xs">{formatINR(r.spendINR, { compact: true })}</span> },
    { key: "scope3ContributionTCO2e", header: "Cat 1 contrib.", align: "right", sortable: true, cell: (r) => <span className="text-xs">{formatTonnesCO2e(r.scope3ContributionTCO2e, { compact: true })}</span> },
    { key: "esgScore", header: "Score", align: "right", sortable: true, cell: (r) => (
      <span className={`font-semibold tabular-nums ${r.esgScore >= 80 ? "text-emerald-700" : r.esgScore >= 60 ? "text-amber-700" : "text-rose-700"}`}>{r.esgScore}</span>
    )},
    { key: "scorecard", header: "Scorecard", cell: (r) => (
      <div className="h-12 w-12"><SupplierScorecardRadar data={r.scorecard} size={48} /></div>
    )},
    { key: "riskLevel", header: "Risk", cell: (r) => (
      <Badge size="sm" variant={r.riskLevel === "CRITICAL" ? "danger" : r.riskLevel === "HIGH" ? "warning" : r.riskLevel === "MEDIUM" ? "info" : "success"}>
        {r.riskLevel}
      </Badge>
    )},
    { key: "questionnaireStatus", header: "Q'aire", cell: (r) => (
      <Badge size="sm" variant={r.questionnaireStatus === "COMPLETED" ? "success" : r.questionnaireStatus === "OVERDUE" ? "danger" : "outline"}>
        {r.questionnaireStatus}
      </Badge>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Suppliers"
        description="ESG performance, scorecards and questionnaires"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link href="/suppliers/questionnaires"><Send className="h-4 w-4" />Questionnaires</Link></Button>
            <Button size="sm"><Plus className="h-4 w-4" />Add Supplier</Button>
          </>
        }
      />

      {critical > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="h-4 w-4" />
          <span><strong>{critical} suppliers at HIGH or CRITICAL risk.</strong> Review and escalate.</span>
          <Button variant="outline" size="sm" className="ml-auto border-rose-300 text-rose-900 hover:bg-rose-100">View flagged</Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {suppliers && <DataTable data={suppliers} columns={cols} rowKey={(r) => r.id} dense onRowClick={(r) => router.push(`/suppliers/${r.id}`)} />}
        </CardContent>
      </Card>
    </div>
  );
}
