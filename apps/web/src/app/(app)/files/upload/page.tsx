"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { SourcePicker } from "@/components/files/source-picker";

export default function FilesUploadPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Add data" description="Drop, connect, or pull. We classify, OCR and extract automatically." />
      <Card>
        <CardContent className="p-6">
          <SourcePicker />
        </CardContent>
      </Card>
    </div>
  );
}
