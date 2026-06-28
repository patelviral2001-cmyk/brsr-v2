"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function AssessmentDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const isNew = id === "new";

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={isNew ? "New materiality assessment" : `Assessment ${id}`}
        description="Materiality assessment detail and stakeholder scoring"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/materiality">Back to materiality</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{isNew ? "Setup wizard arriving in v2.1" : "Coming in v2.1"}</CardTitle>
          <CardDescription>
            {isNew
              ? "We're polishing the new-assessment wizard. For now, scope it through the Materiality matrix."
              : "Per-assessment stakeholder scoring, double-materiality drilldowns, and revision history."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Compass className="h-6 w-6" />}
            title={isNew ? "Start with the matrix" : "Detailed assessment view is rolling out"}
            description={
              isNew
                ? "Use the existing matrix to capture topic scores; we'll migrate them into the new format automatically."
                : "Until then, aggregated insights for this assessment appear on the Materiality matrix."
            }
            action={
              <Button asChild>
                <Link href="/materiality">Open materiality matrix</Link>
              </Button>
            }
          />
          {!isNew && (
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500">
              <Badge variant="outline" size="sm">Assessment ID</Badge>
              <code className="font-mono">{id}</code>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
