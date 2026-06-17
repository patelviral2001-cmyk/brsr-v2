"use client";

import { FileText, ExternalLink } from "lucide-react";
import Link from "next/link";

interface Props { fileId: string; fileName: string; page?: number }

export function SourceCitationLink({ fileId, fileName, page }: Props) {
  return (
    <Link href={`/files/${fileId}`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:border-primary-300 hover:bg-primary-50">
      <FileText className="h-3 w-3 text-slate-400" />
      <span className="max-w-[180px] truncate">{fileName}</span>
      {page && <span className="text-slate-400">p.{page}</span>}
      <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
    </Link>
  );
}
