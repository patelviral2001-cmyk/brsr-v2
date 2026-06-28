"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const QS = [
  { id: "q1", name: "CDP Climate FY25-26", recipients: 25, responses: 18, due: "30 Sep 2026" },
  { id: "q2", name: "BRSR Cat 1 PCF Pulse", recipients: 12, responses: 9, due: "31 Aug 2026" },
  { id: "q3", name: "Modern Slavery Attestation", recipients: 25, responses: 22, due: "30 Jun 2026" },
];

function pct(num: number, denom: number) {
  if (!denom || denom <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((num / denom) * 100)));
}

export default function QuestionnairesPage() {
  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Supplier Questionnaires"
        description="Send, track, and ingest standardized ESG questionnaires"
        actions={
          <Button
            size="sm"
            onClick={() =>
              toast.info("New Questionnaire", {
                description: "Questionnaire builder ships in v2.1 — for now, configure templates under Settings → Integrations.",
              })
            }
            aria-label="Create new questionnaire"
          >
            <Plus className="h-4 w-4" />New Questionnaire
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {QS.map((q) => {
          const p = pct(q.responses, q.recipients);
          return (
            <Card key={q.id}>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-slate-900">{q.name}</h3>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{q.responses} / {q.recipients} responded</span>
                  <Badge variant="outline" size="sm">Due {q.due}</Badge>
                </div>
                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={p}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${q.name} response rate`}
                >
                  <div className="h-full bg-primary-600" style={{ width: `${p}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
