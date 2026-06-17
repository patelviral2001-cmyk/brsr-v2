"use client";

import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExtractionPreviewPane } from "@/components/extraction/extraction-preview-pane";
import { useFile, useExtractedFields } from "@/lib/api/queries";
import { Download, FileText } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function FileDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { data: file } = useFile(id);
  const { data: fields } = useExtractedFields(id);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const activeField = fields?.find((f) => f.id === selectedFieldId) ?? fields?.[0];

  return (
    <div className="p-6">
      <PageHeader
        title={file?.filename ?? "File"}
        description={file ? `${file.docType.replace("_", " ")} · ${formatBytes(file.sizeBytes)} · uploaded by ${file.uploadedBy}` : "Loading…"}
        actions={file && (
          <>
            <Badge variant="outline" className={cn(STATUS_COLORS[file.status])}>{file.status}</Badge>
            <Button variant="outline" size="sm"><Download className="h-4 w-4" />Original</Button>
            <Button size="sm">Re-extract</Button>
          </>
        )}
      />

      <Card>
        <CardContent className="p-0">
          <div className="grid h-[680px] grid-cols-1 lg:grid-cols-[260px_1fr]">
            {/* Field list */}
            <div className="overflow-y-auto border-r border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">{fields?.length ?? 0} extracted fields</div>
              <div className="mt-3 space-y-1">
                {fields?.map((f) => (
                  <button key={f.id} onClick={() => setSelectedFieldId(f.id)} className={cn(
                    "w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50",
                    activeField?.id === f.id && "bg-primary-50"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="truncate text-xs font-medium text-slate-900">{f.fieldLabel}</div>
                      <Badge variant="outline" size="sm">{Math.round(f.confidence * 100)}%</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">{String(f.value)} {f.unit}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {activeField ? (
              <ExtractionPreviewPane field={activeField} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <FileText className="h-10 w-10" />
                <p className="mt-2 text-sm">Select a field to review</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
