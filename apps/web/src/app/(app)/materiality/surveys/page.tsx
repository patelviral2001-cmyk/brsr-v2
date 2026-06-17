"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";

const SURVEYS = [
  { id: "srv_001", name: "Annual Materiality Survey FY24-25", recipients: 482, responses: 482, status: "COMPLETED", closedAt: "2025-12-30" },
  { id: "srv_002", name: "Supplier ESG Pulse Q1FY26", recipients: 25, responses: 18, status: "ACTIVE", closedAt: null },
  { id: "srv_003", name: "Employee Wellbeing Index", recipients: 2840, responses: 2218, status: "ACTIVE", closedAt: null },
];

export default function SurveysPage() {
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Surveys" description="Stakeholder engagement and pulse studies" actions={<Button size="sm">New Survey</Button>} />
      <div className="grid gap-3 lg:grid-cols-2">
        {SURVEYS.map((s) => (
          <Card key={s.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{s.name}</h3>
                <Badge variant={s.status === "ACTIVE" ? "info" : "success"} size="sm">{s.status}</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-500">{s.responses} of {s.recipients} responses ({Math.round((s.responses / s.recipients) * 100)}%)</div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-primary-600" style={{ width: `${(s.responses / s.recipients) * 100}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
