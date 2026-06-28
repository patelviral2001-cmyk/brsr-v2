"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Compass, Users2 } from "lucide-react";

export default function SurveyDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={`Survey ${id}`}
        description="Survey detail with responses and analytics"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/materiality/surveys"><Users2 className="h-4 w-4" />All surveys</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Coming in v2.1</CardTitle>
          <CardDescription>Per-survey response analytics, demographic cuts, and longitudinal pulse tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Compass className="h-6 w-6" />}
            title="Detailed survey view is rolling out"
            description="Until then, aggregated insights for this survey are visible on the Materiality matrix."
            action={
              <Button asChild>
                <Link href="/materiality">Back to materiality</Link>
              </Button>
            }
          />
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500">
            <Badge variant="outline" size="sm">Survey ID</Badge>
            <code className="font-mono">{id}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
