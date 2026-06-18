"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const SURVEYS = [
  { id: "srv_001", name: "Annual Materiality Survey FY24-25", recipients: 482, responses: 482, status: "COMPLETED", closedAt: "2025-12-30" },
  { id: "srv_002", name: "Supplier ESG Pulse Q1FY26", recipients: 25, responses: 18, status: "ACTIVE", closedAt: null },
  { id: "srv_003", name: "Employee Wellbeing Index", recipients: 2840, responses: 2218, status: "ACTIVE", closedAt: null },
];

function pct(num: number, denom: number) {
  if (!denom || denom <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((num / denom) * 100)));
}

export default function SurveysPage() {
  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Surveys"
        description="Stakeholder engagement and pulse studies"
        actions={
          <Button
            size="sm"
            onClick={() =>
              toast.info("New Survey", {
                description: "The survey designer ships in v2.1. Use Materiality → New Assessment to seed responses.",
              })
            }
            aria-label="Create new survey"
          >
            <Plus className="h-4 w-4" />New Survey
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {SURVEYS.map((s) => {
          const p = pct(s.responses, s.recipients);
          return (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{s.name}</h3>
                  <Badge variant={s.status === "ACTIVE" ? "info" : "success"} size="sm">{s.status}</Badge>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {s.responses} of {s.recipients} responses ({p}%)
                </div>
                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={p}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${s.name} response rate`}
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
