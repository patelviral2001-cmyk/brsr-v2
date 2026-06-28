"use client";

const PROMPTS = [
  "Explain Scope 3 Cat 1 and where our risk concentrates",
  "Generate the Principle 6 narrative for our BRSR",
  "Why is energy up 18% this Q?",
  "Benchmark our LTIFR vs. Tata Power and Adani Green",
  "Draft the climate scenario analysis for IFRS S2",
  "Summarize the FY24-25 assurance opinion",
];

export function SuggestedPrompts({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROMPTS.map((p) => (
        <button key={p} onClick={() => onPick(p)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition-all hover:border-primary-300 hover:bg-primary-50">
          {p}
        </button>
      ))}
    </div>
  );
}
