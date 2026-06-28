"use client";

import { PageHeader } from "@/components/common/page-header";
import { GenerationWizard } from "@/components/reports/generation-wizard";

export default function GenerateReportPage() {
  return (
    <div className="p-6">
      <PageHeader title="Generate Report" description="6-step wizard. PDF + XLSX + XBRL + DOCX + HTML by default." />
      <GenerationWizard />
    </div>
  );
}
