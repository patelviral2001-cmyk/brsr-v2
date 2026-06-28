"use client";

import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface Citation {
  id: string;
  type: string;
  ref: string;
  label: string;
  href?: string;
}

export function CitationChip({ citation }: { citation: Citation }) {
  return (
    <a href={citation.href ?? "#"} target="_blank" rel="noreferrer" className="inline-flex">
      <Badge variant="primary" size="sm" className="cursor-pointer hover:bg-primary-100">
        <span className="text-[9px] uppercase opacity-60">{citation.type}</span>
        <span className="ml-1">{citation.label}</span>
        <ExternalLink className="ml-1 h-2.5 w-2.5" />
      </Badge>
    </a>
  );
}
