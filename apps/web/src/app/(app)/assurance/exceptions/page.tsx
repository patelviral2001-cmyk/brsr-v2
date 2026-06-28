"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useExceptions } from "@/lib/api/queries";
import { formatDate } from "@/lib/format";
import { AlertTriangle, ShieldCheck } from "lucide-react";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "bg-rose-500", HIGH: "bg-orange-500", MEDIUM: "bg-amber-500", LOW: "bg-sky-500", INFO: "bg-slate-400",
};

export default function ExceptionsPage() {
  const { data: exceptions, isLoading, isError, error, refetch } = useExceptions();
  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Assurance Exceptions" description="Findings raised during the assurance engagement" />
        <TableSkeleton rows={6} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Assurance Exceptions" description="Findings raised during the assurance engagement" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load exceptions"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }
  const list = Array.isArray(exceptions) ? exceptions : [];
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Assurance Exceptions" description="Findings raised during the assurance engagement" />
      {list.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="No exceptions raised"
          description="Your engagement is clean — nothing for management to respond to."
        />
      ) : (
      <div className="space-y-2">
        {list.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex items-start gap-3 p-4">
              <span className={`mt-1.5 h-2 w-2 rounded-full ${SEV_COLOR[e.severity] ?? "bg-slate-300"}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{e.metricName}</span>
                  <Badge variant="outline" size="sm">{e.severity}</Badge>
                  <Badge variant={e.status === "RESOLVED" ? "success" : e.status === "RESPONDED" ? "info" : "warning"} size="sm">{e.status}</Badge>
                  <code className="text-[10px] text-slate-400">{e.metricKey}</code>
                </div>
                <p className="mt-1 text-sm text-slate-600">{e.description}</p>
                {e.managementResponse && (
                  <div className="mt-2 rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs text-primary-900">
                    <strong>Management response:</strong> {e.managementResponse}
                  </div>
                )}
                <div className="mt-2 text-[10px] text-slate-400">{formatDate(e.createdAt)}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
