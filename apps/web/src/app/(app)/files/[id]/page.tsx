"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExtractionPreviewPane } from "@/components/extraction/extraction-preview-pane";
import { useFile, useExtractedFields, useReprocessFile } from "@/lib/api/queries";
import { AlertTriangle, Download, FileText, RefreshCw } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function FileDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { data: file, isLoading, isError, error, refetch } = useFile(id);
  const { data: fields } = useExtractedFields(id);
  const reprocess = useReprocessFile();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const activeField = fields?.find((f) => f.id === selectedFieldId) ?? fields?.[0];

  const handleDownloadOriginal = () => {
    const url = file?.signedUrl;
    if (!url) {
      toast.error("Download unavailable", { description: "No signed URL yet — try again in a moment." });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleReExtract = () => {
    if (!id) return;
    reprocess.mutate(id, {
      onSuccess: () => toast.success("Re-extraction queued", { description: "We'll refresh the field list once it finishes." }),
      onError: (err) => toast.error("Couldn't queue re-extraction", {
        description: err instanceof Error ? err.message : "Try again",
      }),
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <PageHeader title="Loading file…" />
        <PageSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="File" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load this file"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="p-6">
        <PageHeader title="File not found" />
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={`No file with id "${id}"`}
          description="It may have been deleted, or you may not have access."
          action={<Button asChild><Link href="/files">Back to files</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title={file.filename ?? "File"}
        description={`${(file.docType ?? "UNKNOWN").replace(/_/g, " ")} · ${formatBytes(file.sizeBytes ?? 0)} · uploaded by ${file.uploadedBy ?? "unknown"}`}
        actions={
          <>
            <Badge variant="outline" className={cn(file.status ? STATUS_COLORS[file.status] : "")}>
              {file.status ?? "UNKNOWN"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOriginal}
              disabled={!file.signedUrl}
              aria-label="Download original document"
            >
              <Download className="h-4 w-4" />Original
            </Button>
            <Button
              size="sm"
              onClick={handleReExtract}
              disabled={reprocess.isPending}
              aria-label="Re-run extraction"
            >
              <RefreshCw className={cn("h-4 w-4", reprocess.isPending && "animate-spin")} />
              {reprocess.isPending ? "Queuing…" : "Re-extract"}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="grid h-[680px] grid-cols-1 lg:grid-cols-[260px_1fr]">
            {/* Field list */}
            <div className="overflow-y-auto border-r border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                {fields?.length ?? 0} extracted fields
              </div>
              <div className="mt-3 space-y-1">
                {fields?.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFieldId(f.id)}
                    aria-pressed={activeField?.id === f.id}
                    className={cn(
                      "w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50",
                      activeField?.id === f.id && "bg-primary-50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="truncate text-xs font-medium text-slate-900">{f.fieldLabel}</div>
                      <Badge variant="outline" size="sm">{Math.round((f.confidence ?? 0) * 100)}%</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">{String(f.value ?? "")} {f.unit}</div>
                  </button>
                ))}
                {(fields?.length ?? 0) === 0 && (
                  <div className="px-2 py-4 text-xs text-slate-400">
                    No fields extracted yet.
                  </div>
                )}
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
