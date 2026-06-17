"use client";

import { Badge } from "@/components/ui/badge";
import { FileText, Pencil, ShieldCheck } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BRSRQuestion } from "@/types";

export function BRSRQuestionCard({ question }: { question: BRSRQuestion }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft transition-shadow hover:shadow-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{question.ref}</Badge>
            <Badge variant="outline" className={cn(STATUS_COLORS[question.status])}>
              {question.status === "ASSURED" && <ShieldCheck className="mr-1 h-3 w-3" />}
              {question.status}
            </Badge>
            {question.metricKey && (
              <Badge variant="primary" size="sm">
                <code className="font-mono">{question.metricKey}</code>
              </Badge>
            )}
          </div>
          <h4 className="mt-2 text-sm font-semibold text-slate-900">{question.text}</h4>
        </div>
        <button className="text-slate-400 hover:text-primary-700">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      {question.answer !== undefined && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
          {typeof question.answer === "string" ? question.answer : String(question.answer)}
        </div>
      )}
      {question.evidence && question.evidence.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10px] uppercase text-slate-400">Evidence:</span>
          {question.evidence.map((e) => (
            <Badge key={e} variant="outline" size="sm">
              <FileText className="h-3 w-3" /> {e}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
