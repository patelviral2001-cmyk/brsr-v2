"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { MaterialityMatrix } from "@/components/charts/materiality-matrix";
import { useMateriality } from "@/lib/api/queries";
import { Compass, Users2 } from "lucide-react";
import Link from "next/link";

export default function MaterialityPage() {
  const { data } = useMateriality();
  const topics = data?.topics ?? [];
  const stakeholders = data?.stakeholders ?? [];
  const highPriority = topics.filter((t) => t.priority === "HIGH");

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Materiality"
        description="Double materiality assessment · 482 responses across 9 stakeholder groups"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link href="/materiality/surveys"><Users2 className="h-4 w-4" />Surveys</Link></Button>
            <Button size="sm"><Compass className="h-4 w-4" />New Assessment</Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Materiality Matrix</CardTitle>
          <CardDescription>Bubble size = stakeholder weight · Top-right quadrant = priority</CardDescription>
        </CardHeader>
        <CardContent>
          <MaterialityMatrix topics={topics} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Priority topics</CardTitle>
            <CardDescription>{highPriority.length} of {topics.length} flagged HIGH</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {highPriority.map((t) => (
              <div key={t.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{t.name}</span>
                    <Badge variant="outline" size="sm">{t.category}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.frameworks.map((f) => <Badge key={f} size="sm" variant="ghost">{f}</Badge>)}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold tabular-nums text-slate-900">{Math.round(t.impactScore * 100)}</div>
                  <div className="text-slate-400">impact</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stakeholders</CardTitle>
            <CardDescription>Influence × Interest</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stakeholders.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">{s.group}</div>
                  <div className="text-xs text-slate-500">{s.engagementMode.join(" · ")}</div>
                </div>
                <div className="flex gap-3 text-xs">
                  <div className="text-right">
                    <div className="font-semibold tabular-nums text-slate-900">{Math.round(s.influence * 100)}</div>
                    <div className="text-slate-400">infl.</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums text-slate-900">{Math.round(s.interest * 100)}</div>
                    <div className="text-slate-400">intr.</div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
