"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, RefreshCw, FileText, Loader2, Save } from "lucide-react";
import { ConfidenceBreakdownPopover } from "./confidence-breakdown-popover";
import { useFile } from "@/lib/api/queries";
import type { ExtractedField } from "@/types";

interface ExtractionPreviewPaneProps {
  field: ExtractedField;
  onApprove?: (id: string, value: string | number) => void;
  onReject?: (id: string, reason: string) => void;
  onEdit?: (id: string, value: string | number) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
  isEditing?: boolean;
}

export function ExtractionPreviewPane({
  field,
  onApprove,
  onReject,
  onEdit,
  isApproving,
  isRejecting,
  isEditing,
}: ExtractionPreviewPaneProps) {
  const [value, setValue] = useState(String(field.value));
  const [reason, setReason] = useState("");

  // Reset local edits when navigating to a different field.
  useEffect(() => {
    setValue(String(field.value));
    setReason("");
  }, [field.id]);

  // The backend includes the signed URL on the file detail.
  const { data: file } = useFile(field.fileId);
  const previewUrl = file?.signedUrl;
  const isImage = previewUrl && /\.(png|jpe?g|webp)$/i.test(previewUrl);
  const isPdf = previewUrl && /\.pdf(\?|$)/i.test(previewUrl);

  const dirty = value !== String(field.value);

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-2">
      {/* Original document preview */}
      <div className="flex flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
          <div className="flex items-center gap-2 text-xs">
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{field.fileName}</span>
            {field.pageNumber && (
              <span className="text-slate-400">· page {field.pageNumber}</span>
            )}
          </div>
          {previewUrl ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                Open full doc →
              </a>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled>
              Open full doc →
            </Button>
          )}
        </div>
        <div className="relative flex-1 overflow-hidden p-6">
          <div className="relative mx-auto h-full max-h-[560px] w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-soft">
            {isPdf ? (
              <iframe
                src={previewUrl}
                title={field.fileName}
                className="h-full w-full rounded-lg"
              />
            ) : isImage ? (
              <div className="relative h-full w-full">
                <Image
                  src={previewUrl!}
                  alt={field.fileName}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 384px"
                  className="object-contain"
                />
                {field.bbox && (
                  <div
                    className="absolute rounded border-2 border-primary-500 bg-primary-100/30 shadow-glow-emerald"
                    style={{
                      left: `${field.bbox.x * 100}%`,
                      top: `${field.bbox.y * 100}%`,
                      width: `${field.bbox.w * 100}%`,
                      height: `${field.bbox.h * 100}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 rounded bg-primary-700 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      {field.fieldLabel}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              // Stylized doc preview fallback (demo / no signed URL).
              <div className="absolute inset-0 p-6">
                <div className="text-[10px] uppercase text-slate-400">Source preview</div>
                <div className="mt-1 text-sm font-bold text-slate-900">{field.fileName}</div>
                <div className="my-3 h-px bg-slate-100" />
                <div className="space-y-1.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Line item #{i + 1}</span>
                      <span className="font-mono text-slate-600">…</span>
                    </div>
                  ))}
                </div>
                {field.bbox && (
                  <div
                    className="absolute rounded border-2 border-primary-500 bg-primary-100/30 shadow-glow-emerald"
                    style={{
                      left: `${field.bbox.x * 100}%`,
                      top: `${field.bbox.y * 100}%`,
                      width: `${field.bbox.w * 100}%`,
                      height: `${field.bbox.h * 100}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 rounded bg-primary-700 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      {field.fieldLabel}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Field details / edit */}
      <div className="flex flex-col bg-white">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <Badge variant="outline" className="font-mono text-[10px]">
                {field.fieldKey}
              </Badge>
              <h2 className="mt-1.5 text-lg font-semibold text-slate-900">
                {field.fieldLabel}
              </h2>
              {field.metricKey && (
                <div className="text-xs text-slate-500">
                  Maps to metric:{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                    {field.metricKey}
                  </code>
                </div>
              )}
            </div>
            <ConfidenceBreakdownPopover
              overall={field.confidence}
              breakdown={field.confidenceBreakdown}
            />
          </div>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            <Label htmlFor="extracted-value">Extracted value</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="extracted-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="font-mono"
              />
              {field.unit && <Badge variant="outline">{field.unit}</Badge>}
              {dirty && onEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(field.id, coerceValue(value))}
                  disabled={isEditing}
                >
                  {isEditing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              )}
            </div>
            {field.rawText && (
              <div className="mt-1 text-[10px] text-slate-400">
                Raw text: <code className="font-mono">{field.rawText}</code>
              </div>
            )}
          </div>

          <div>
            <Label>Reason (for reject / edit)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5"
              placeholder="Optional context for downstream reviewers…"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="font-medium text-slate-700">Audit context</div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 text-slate-500">
              <div>
                File ID: <span className="font-mono text-slate-700">{field.fileId}</span>
              </div>
              <div>
                Field ID: <span className="font-mono text-slate-700">{field.id}</span>
              </div>
              <div>
                Status: <span className="text-slate-700">{field.status}</span>
              </div>
              <div>
                Page: <span className="text-slate-700">{field.pageNumber ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 p-4">
          <Button
            onClick={() => onApprove?.(field.id, coerceValue(value))}
            className="flex-1"
            disabled={isApproving || isRejecting}
          >
            {isApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => onReject?.(field.id, reason)}
            className="flex-1"
            disabled={isApproving || isRejecting}
          >
            {isRejecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Reject
          </Button>
          <Button variant="outline" size="icon" disabled>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function coerceValue(raw: string): string | number {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  const num = Number(trimmed.replace(/,/g, ""));
  if (Number.isFinite(num) && /^-?\d+(?:\.\d+)?$/.test(trimmed.replace(/,/g, ""))) {
    return num;
  }
  return raw;
}
