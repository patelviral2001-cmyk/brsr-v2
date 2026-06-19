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
import { useFile, useExtractedFields, useReprocessFile, useUsers, apiGet } from "@/lib/api/queries";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { AlertTriangle, Download, FileText, RefreshCw, Inbox } from "lucide-react";
import { formatBytes, formatRelative } from "@/lib/format";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function FileDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { data: file, isLoading, isError, error, refetch } = useFile(id);
  const { data: fields } = useExtractedFields(id);
  const { data: users } = useUsers();
  const reprocess = useReprocessFile();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const activeField = fields?.find((f) => f.id === selectedFieldId) ?? fields?.[0];

  // The API returns `uploadedBy` as a raw user id (cuid). Show the user's
  // display name instead — falling back to a friendly short tag when the
  // users list hasn't loaded yet.
  const f = file as any;
  const uploaderId: string | undefined = f?.uploadedBy ?? undefined;
  const uploader = (Array.isArray(users) ? users : []).find((u: any) => u?.id === uploaderId) as any;
  const uploaderLabel =
    uploader?.name ||
    [uploader?.firstName, uploader?.lastName].filter(Boolean).join(" ").trim() ||
    uploader?.email ||
    (uploaderId ? `user/${uploaderId.slice(-6)}` : "unknown");
  const filename = f?.originalName ?? f?.filename ?? "Untitled file";
  const uploadedAt = f?.uploadedAt;

  const handleDownloadOriginal = async () => {
    if (!id) return;
    // The /files/:id payload doesn't pre-include signedUrl; fetch it on demand.
    try {
      const res = await apiGet<{ url?: string; signedUrl?: string }>(ENDPOINTS.fileSignedUrl(id));
      const url = res?.url ?? res?.signedUrl;
      if (!url) {
        toast.error("Download unavailable", { description: "Server did not return a download URL." });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Couldn't get download link", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
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

  const fieldCount = fields?.length ?? 0;
  const status = file.status ?? "UNKNOWN";
  // The extractor sometimes returns 0 fields on documents that look like
  // ESG evidence to the classifier but don't match any known canonical key
  // (scanned-only images, encrypted PDFs, non-Indian utility formats, etc.).
  // The previous UI showed an unhelpful "Select a field to review" prompt
  // even though there was nothing to select; tell the customer what's
  // really going on and give them an actionable next step.
  const showNoFieldsExplainer = fieldCount === 0 &&
    (status === "REVIEW_NEEDED" || status === "EXTRACTED" || status === "REJECTED" || status === "EXTRACTION_FAILED");

  return (
    <div className="p-6">
      <PageHeader
        title={filename}
        description={
          [
            (file.docType ?? "UNKNOWN").replace(/_/g, " "),
            formatBytes(file.sizeBytes ?? 0),
            uploadedAt ? `uploaded ${formatRelative(uploadedAt)}` : null,
            `by ${uploaderLabel}`,
          ]
            .filter(Boolean)
            .join(" · ")
        }
        actions={
          <>
            <Badge variant="outline" className={cn(STATUS_COLORS[status] ?? "")}>
              {status.replace(/_/g, " ")}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOriginal}
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
                {fieldCount} extracted fields
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
                {fieldCount === 0 && (
                  <div className="px-2 py-4 text-xs text-slate-400">
                    No fields extracted yet.
                  </div>
                )}
              </div>
            </div>

            {/* Preview */}
            {activeField ? (
              <ExtractionPreviewPane field={activeField} />
            ) : showNoFieldsExplainer ? (
              <div className="flex h-full flex-col items-center justify-center px-10 text-center text-slate-500">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <Inbox className="h-6 w-6" />
                </div>
                <p className="mt-4 max-w-md text-sm font-medium text-slate-900">
                  We couldn't extract any ESG metrics from this file
                </p>
                <p className="mt-1 max-w-md text-xs text-slate-500">
                  This usually means the document is a scanned image without text, an
                  unsupported format, or its content doesn't match any of the canonical
                  metrics our extractors recognise. Try re-running the extractor, or
                  upload the original PDF/CSV instead of a screenshot.
                </p>
                <div className="mt-5 flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleDownloadOriginal}>
                    <Download className="h-4 w-4" />View original
                  </Button>
                  <Button size="sm" onClick={handleReExtract} disabled={reprocess.isPending}>
                    <RefreshCw className={cn("h-4 w-4", reprocess.isPending && "animate-spin")} />
                    {reprocess.isPending ? "Queuing…" : "Re-extract"}
                  </Button>
                </div>
              </div>
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
