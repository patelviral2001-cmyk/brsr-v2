"use client";

import { PageHeader } from "@/components/common/page-header";
import { useParams } from "next/navigation";

export default function AssessmentDetailPage() {
  const params = useParams();
  return (
    <div className="p-6">
      <PageHeader title={`Assessment ${params?.id}`} description="Materiality assessment detail" />
    </div>
  );
}
