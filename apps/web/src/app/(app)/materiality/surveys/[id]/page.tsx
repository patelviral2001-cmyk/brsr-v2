"use client";

import { PageHeader } from "@/components/common/page-header";
import { useParams } from "next/navigation";

export default function SurveyDetailPage() {
  const params = useParams();
  return (
    <div className="p-6">
      <PageHeader title={`Survey ${params?.id}`} description="Survey detail with responses and analytics" />
    </div>
  );
}
