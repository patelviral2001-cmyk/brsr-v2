"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { ReportCard } from "@/components/reports/report-card";
import { useReports } from "@/lib/api/queries";
import { Plus, Sparkles } from "lucide-react";

export default function ReportsPage() {
  const { data: reports } = useReports();
  const reportsList = Array.isArray(reports) ? reports : [];
  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Reports"
        description="Generated, assured and filed reports across all frameworks"
        actions={
          <Button asChild className="bg-gradient-to-r from-primary-600 to-primary-800">
            <Link href="/reports/generate"><Sparkles className="h-4 w-4" />Generate New Report</Link>
          </Button>
        }
      />

      <div className="flex gap-2">
        <Badge variant="primary">{reportsList.length} total</Badge>
        <Badge variant="success">{reportsList.filter((r) => r.status === "ASSURED").length} assured</Badge>
        <Badge variant="info">{reportsList.filter((r) => r.status === "DRAFT").length} draft</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {reportsList.map((r) => <ReportCard key={r.id} report={r} />)}
      </div>
    </div>
  );
}
