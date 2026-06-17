"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { Plus } from "lucide-react";

const QS = [
  { id: "q1", name: "CDP Climate FY25-26", recipients: 25, responses: 18, due: "30 Sep 2026" },
  { id: "q2", name: "BRSR Cat 1 PCF Pulse", recipients: 12, responses: 9, due: "31 Aug 2026" },
  { id: "q3", name: "Modern Slavery Attestation", recipients: 25, responses: 22, due: "30 Jun 2026" },
];

export default function QuestionnairesPage() {
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Supplier Questionnaires" description="Send, track, and ingest standardized ESG questionnaires" actions={<Button size="sm"><Plus className="h-4 w-4" />New Questionnaire</Button>} />
      <div className="grid gap-3 lg:grid-cols-3">
        {QS.map((q) => (
          <Card key={q.id}>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-slate-900">{q.name}</h3>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{q.responses} / {q.recipients} responded</span>
                <Badge variant="outline" size="sm">Due {q.due}</Badge>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-primary-600" style={{ width: `${(q.responses / q.recipients) * 100}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
