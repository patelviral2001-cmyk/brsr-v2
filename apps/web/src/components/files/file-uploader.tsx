"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUploadFile } from "@/lib/api/queries";
import { useScopeStore } from "@/stores/scope.store";

interface UploadedFile {
  id: string; // local id for React keys
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  message?: string;
  remoteId?: string;
}

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const ACCEPTED_MIME = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "text/csv": [".csv"],
};

export function FileUploader({
  scopeNodeId,
  docType,
  onUploaded,
}: {
  scopeNodeId?: string;
  docType?: string;
  onUploaded?: (remoteId: string) => void;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const upload = useUploadFile();

  // Fall back to the currently scoped node if the caller didn't pass one.
  const scopedNodeFromStore = useScopeStoreOrNull()?.activeScopeId;
  const effectiveScopeNodeId = scopeNodeId ?? scopedNodeFromStore ?? undefined;

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      // Surface dropzone-level rejections (mime / size / too-many).
      for (const r of rejected) {
        toast.error(`Can't upload ${r.file.name}`, {
          description: r.errors.map((e) => e.message).join(", "),
        });
      }

      const next: UploadedFile[] = accepted.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        progress: 0,
        status: "uploading" as const,
      }));
      setFiles((p) => [...p, ...next]);

      // Fire one upload per file in parallel; track progress per file.
      next.forEach((uf) => {
        upload.mutate(
          {
            file: uf.file,
            scopeNodeId: effectiveScopeNodeId,
            docType,
            onProgress: (pct) => {
              setFiles((curr) =>
                curr.map((f) => (f.id === uf.id ? { ...f, progress: pct } : f)),
              );
            },
          },
          {
            onSuccess: (result) => {
              setFiles((curr) =>
                curr.map((f) =>
                  f.id === uf.id
                    ? { ...f, status: "done", progress: 100, remoteId: result.id }
                    : f,
                ),
              );
              toast.success(`Uploaded ${uf.file.name}`, {
                description: "Processing has started.",
              });
              onUploaded?.(result.id);
            },
            onError: (err) => {
              const message =
                err instanceof Error ? err.message : "Upload failed";
              setFiles((curr) =>
                curr.map((f) =>
                  f.id === uf.id ? { ...f, status: "error", message } : f,
                ),
              );
              toast.error(`Failed to upload ${uf.file.name}`, {
                description: message,
              });
            },
          },
        );
      });
    },
    [docType, effectiveScopeNodeId, onUploaded, upload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: MAX_FILE_SIZE_BYTES,
    accept: ACCEPTED_MIME,
  });

  const remove = (id: string) =>
    setFiles((curr) => curr.filter((f) => f.id !== id));

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white px-6 py-16 text-center transition-all",
          isDragActive
            ? "border-primary-400 bg-primary-50/50"
            : "border-slate-300 hover:border-slate-400",
        )}
      >
        <input {...getInputProps()} />
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <Upload className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">
          {isDragActive ? "Drop files here" : "Drop files here, or click to browse"}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          PDF, XLSX, CSV, PNG/JPG · Up to 100MB · Multi-file supported
        </p>
        <Button type="button" variant="default" className="mt-4">
          Select Files
        </Button>
        <div className="mt-6 flex items-center gap-4 text-xs text-slate-400">
          <span>or pull from:</span>
          <span className="rounded border border-slate-200 px-2 py-1">SAP S/4HANA</span>
          <span className="rounded border border-slate-200 px-2 py-1">Tally</span>
          <span className="rounded border border-slate-200 px-2 py-1">Oracle ERP</span>
          <span className="rounded border border-slate-200 px-2 py-1">Email-in</span>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-white p-3",
                f.status === "error" ? "border-rose-200" : "border-slate-200",
              )}
            >
              {f.status === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : f.status === "error" ? (
                <AlertCircle className="h-4 w-4 text-rose-600" />
              ) : (
                <FileText className="h-4 w-4 text-slate-400" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">
                  {f.file.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{formatBytes(f.file.size)}</span>
                  {f.status === "error" && f.message && (
                    <span className="truncate text-rose-600">· {f.message}</span>
                  )}
                  {f.status === "done" && f.remoteId && (
                    <span className="truncate text-emerald-700">· uploaded</span>
                  )}
                </div>
                {f.status === "uploading" && (
                  <Progress value={f.progress} className="mt-1.5 h-1" />
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="text-slate-400 hover:text-rose-600"
                aria-label={`Remove ${f.file.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Safe scope-store reader -------------------------------------
// The scope store is optional — the uploader is sometimes rendered
// before it's hydrated, in which case we silently fall back to no scope.
function useScopeStoreOrNull(): { activeScopeId?: string } | null {
  try {
    return useScopeStore((s) => ({ activeScopeId: s.activeScopeId }));
  } catch {
    return null;
  }
}
