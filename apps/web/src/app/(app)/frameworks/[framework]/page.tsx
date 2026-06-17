"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { BRSRSectionTree } from "@/components/brsr/section-tree";
import { BRSRQuestionCard } from "@/components/brsr/question-card";
import { useBrsrSections } from "@/lib/api/queries";
import { FRAMEWORKS } from "@/lib/constants";

export default function FrameworkDetailPage() {
  const params = useParams();
  const fw = String(params?.framework ?? "BRSR");
  const meta = FRAMEWORKS.find((f) => f.id === fw);
  const { data: sections } = useBrsrSections();
  const [activeId, setActiveId] = useState<string>("p6");
  const safeSections = Array.isArray(sections) ? sections : [];
  const activeSection = safeSections.find((s) => s.id === activeId);

  return (
    <div className="p-6">
      <PageHeader
        title={meta?.name ?? fw}
        description={meta?.fullName ?? "Framework drill-down"}
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4">
          <Card>
            <CardContent className="max-h-[760px] overflow-y-auto p-3 scrollbar-thin">
              {safeSections.length > 0 && <BRSRSectionTree sections={safeSections} activeId={activeId} onSelect={setActiveId} />}
            </CardContent>
          </Card>
        </div>
        <div className="col-span-12 space-y-3 lg:col-span-8">
          {activeSection && (() => {
            const questions = Array.isArray(activeSection.questions) ? activeSection.questions : [];
            const principle = activeSection.principle ?? "";
            return (
              <>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-primary-50 via-white to-white p-5">
                  <div className="text-xs uppercase tracking-wider text-primary-700">Principle {principle.slice(1)}</div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{activeSection.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">{activeSection.answered ?? 0} of {activeSection.total ?? 0} questions answered.</p>
                </div>
                {questions.map((q) => <BRSRQuestionCard key={q.id} question={q} />)}
                {questions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                    Detailed question drilldown for {activeSection.title} is generated dynamically from your mapped metrics.
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
