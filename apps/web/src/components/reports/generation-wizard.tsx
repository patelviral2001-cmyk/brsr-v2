"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { FrameworkSelector } from "@/components/common/framework-selector";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const STEPS = ["Framework", "Period", "Scope", "Sections", "Format", "Review"];

const FORMATS = ["PDF", "XLSX", "XBRL", "DOCX", "HTML"];

export function GenerationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [frameworks, setFrameworks] = useState<string[]>(["BRSR", "BRSR_CORE"]);
  const [fy, setFy] = useState("FY24-25");
  const [scope, setScope] = useState("node_le_india");
  const [sections, setSections] = useState<string[]>(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]);
  const [formats, setFormats] = useState<string[]>(["PDF", "XLSX", "XBRL", "DOCX", "HTML"]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Idle");

  const toggle = (arr: string[], setArr: (v: string[]) => void, item: string) =>
    setArr(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);

  const start = async () => {
    setGenerating(true);
    const stages = [
      "Loading metrics from registry…",
      "Resolving formula bindings (CEL)…",
      "Computing scope 1, 2, 3 from emission factors…",
      "Mapping metrics to BRSR P1–P9…",
      "Rendering PDF (Inter + custom layout)…",
      "Generating XBRL instance with SEBI taxonomy…",
      "Generating XLSX workbook…",
      "Sealing snapshot hash & storing…",
    ];
    for (let i = 0; i < stages.length; i++) {
      setStage(stages[i]);
      setProgress(((i + 1) / stages.length) * 100);
      await new Promise((r) => setTimeout(r, 700));
    }
    toast.success("Report generated");
    router.push("/reports");
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Steps */}
      <div className="mb-8 flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center">
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
              i < step ? "bg-primary-700 text-white" : i === step ? "ring-2 ring-primary-300 bg-primary-50 text-primary-800" : "bg-slate-100 text-slate-500"
            )}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <div className="ml-2 hidden text-xs font-medium text-slate-700 sm:block">{s}</div>
            {i < STEPS.length - 1 && <div className={cn("ml-2 mr-2 flex-1 border-t", i < step ? "border-primary-300" : "border-slate-200")} />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {generating ? (
            <div className="space-y-4 py-8 text-center">
              <Sparkles className="mx-auto h-10 w-10 animate-pulse text-primary-700" />
              <h3 className="text-lg font-semibold text-slate-900">Generating report…</h3>
              <p className="text-sm text-slate-500">{stage}</p>
              <div className="mx-auto h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {step === 0 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Choose frameworks</h3>
                  <p className="text-sm text-slate-500">Select one or more — the report bundle will include each.</p>
                  <div className="mt-4"><FrameworkSelector value={frameworks} onChange={setFrameworks} /></div>
                </div>
              )}
              {step === 1 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Reporting period</h3>
                  <p className="text-sm text-slate-500">Indian fiscal year (Apr–Mar).</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {["FY25-26", "FY24-25", "FY23-24", "FY22-23"].map((y) => (
                      <button key={y} onClick={() => setFy(y)} className={cn(
                        "rounded-lg border p-3 text-center text-sm font-medium transition-all",
                        fy === y ? "border-primary-300 bg-primary-50 text-primary-900" : "border-slate-200 hover:border-slate-300"
                      )}>{y}</button>
                    ))}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Scope</h3>
                  <p className="text-sm text-slate-500">Entity to consolidate at.</p>
                  <div className="mt-4 space-y-1.5">
                    {[
                      { id: "node_root", name: "Imagine Powertree Group (consolidated)", type: "GROUP" },
                      { id: "node_le_india", name: "Imagine Powertree India Ltd.", type: "LEGAL_ENTITY" },
                      { id: "node_le_renew", name: "Imagine Powertree Renewables Pvt Ltd.", type: "LEGAL_ENTITY" },
                    ].map((n) => (
                      <button key={n.id} onClick={() => setScope(n.id)} className={cn(
                        "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all",
                        scope === n.id ? "border-primary-300 bg-primary-50" : "border-slate-200 hover:border-slate-300"
                      )}>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{n.name}</div>
                          <Badge variant="outline" size="sm">{n.type}</Badge>
                        </div>
                        <div className={cn("h-4 w-4 rounded-full border-2", scope === n.id ? "border-primary-700 bg-primary-700" : "border-slate-300")} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {step === 3 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Sections</h3>
                  <p className="text-sm text-slate-500">Which BRSR principles / framework sections to include.</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {Array.from({ length: 9 }).map((_, i) => {
                      const p = `P${i + 1}`;
                      return (
                        <button key={p} onClick={() => toggle(sections, setSections, p)} className={cn(
                          "rounded-lg border p-3 text-center text-sm font-medium transition-all",
                          sections.includes(p) ? "border-primary-300 bg-primary-50 text-primary-900" : "border-slate-200 hover:border-slate-300"
                        )}>{p}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {step === 4 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Formats</h3>
                  <p className="text-sm text-slate-500">All formats will be generated and stored.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {FORMATS.map((f) => (
                      <button key={f} onClick={() => toggle(formats, setFormats, f)} className={cn(
                        "rounded-lg border p-3 text-center font-bold transition-all",
                        formats.includes(f) ? "border-primary-300 bg-primary-50 text-primary-900" : "border-slate-200 hover:border-slate-300"
                      )}>{f}</button>
                    ))}
                  </div>
                </div>
              )}
              {step === 5 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Review & Generate</h3>
                  <div className="mt-4 space-y-2">
                    <Row label="Frameworks" value={frameworks.join(", ")} />
                    <Row label="Period" value={fy} />
                    <Row label="Scope" value={scope} />
                    <Row label="Sections" value={sections.join(", ")} />
                    <Row label="Formats" value={formats.join(", ")} />
                  </div>
                  <p className="mt-4 text-xs text-slate-500">Expect 30–60 seconds. The result will appear under Reports.</p>
                </div>
              )}

              {/* Nav */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
                <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={start} size="lg" className="bg-gradient-to-r from-primary-600 to-primary-800">
                    <Sparkles className="h-4 w-4" /> Generate Report
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-3">
      <span className="text-xs uppercase text-slate-500">{label}</span>
      <span className="max-w-md text-right text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
