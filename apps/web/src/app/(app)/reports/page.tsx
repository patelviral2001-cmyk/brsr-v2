"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { ReportCard } from "@/components/reports/report-card";
import { useReports } from "@/lib/api/queries";
import { AlertTriangle, FileBarChart2, Plus, Sparkles } from "lucide-react";

export default function ReportsPage() {
  const { data: reports, isLoading, isError, error, refetch } = useReports();
  const reportsList = Array.isArray(reports) ? reports : [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Reports" description="Generated, assured and filed reports across all frameworks" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Reports" description="Generated, assured and filed reports across all frameworks" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load reports"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Reports"
        description="Generated, assured and filed reports across all frameworks"
        actions={
          <Button asChild className="bg-gradient-to-r from-primary-600 to-primary-800">
            <Link href="/reports/generate" aria-label="Generate new report">
              <Sparkles className="h-4 w-4" />Generate New Report
            </Link>
          </Button>
        }
      />

      <div className="flex gap-2">
        <Badge variant="primary">{reportsList.length} total</Badge>
        <Badge variant="success">{reportsList.filter((r) => r.status === "ASSURED").length} assured</Badge>
        <Badge variant="info">{reportsList.filter((r) => r.status === "DRAFT").length} draft</Badge>
      </div>

      {reportsList.length === 0 ? (
        <EmptyState
          icon={<FileBarChart2 className="h-6 w-6" />}
          title="No reports yet"
          description="Generate your first report once metrics and frameworks are mapped."
          action={
            <Button asChild>
              <Link href="/reports/generate"><Plus className="h-4 w-4" />Generate first report</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reportsList.map((r) => <ReportCard key={r.id} report={r} />)}
        </div>
      )}
    </div>
  );
}
