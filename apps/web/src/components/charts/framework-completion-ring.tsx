"use client";

import { FRAMEWORKS } from "@/lib/constants";

interface RingData {
  id: string;
  pct: number; // 0-1
}

export function FrameworkCompletionRings({ data, size = 220 }: { data: RingData[]; size?: number }) {
  const cx = size / 2, cy = size / 2;
  const ringStroke = 9;
  const gap = 4;
  const safe = Array.isArray(data) ? data : [];

  if (safe.length === 0) {
    return (
      <div
        className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400"
        role="img"
        aria-label="No framework completion data"
      >
        No frameworks selected.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
        {safe.map((d, i) => {
          const fw = FRAMEWORKS.find((f) => f.id === d.id);
          const color = fw?.color ?? "#047857";
          const r = (size / 2) - 14 - i * (ringStroke + gap);
          if (r < 18) return null;
          const c = 2 * Math.PI * r;
          const pct = Math.max(0, Math.min(1, d.pct ?? 0));
          const dash = c * pct;
          return (
            <g key={d.id}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={ringStroke} />
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={ringStroke} strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(-90 ${cx} ${cy})`} />
            </g>
          );
        })}
      </svg>
      <div className="mt-3 grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {safe.map((d) => {
          const fw = FRAMEWORKS.find((f) => f.id === d.id);
          return (
            <div key={d.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: fw?.color }} />
              <span className="flex-1 truncate text-slate-600">{fw?.name}</span>
              <span className="font-semibold tabular-nums text-slate-900">{Math.round((d.pct ?? 0) * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
