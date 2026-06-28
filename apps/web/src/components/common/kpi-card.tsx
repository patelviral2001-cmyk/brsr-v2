"use client";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  hint?: string;
  sparkline?: number[];
  ring?: { value: number; max: number; label?: string };
  positiveIsGood?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({ label, value, delta, deltaSuffix = "%", hint, sparkline, ring, positiveIsGood = true, icon, className }: KpiCardProps) {
  const trendColor = delta === undefined ? "" : (delta >= 0 ? (positiveIsGood ? "text-emerald-700" : "text-rose-700") : (positiveIsGood ? "text-rose-700" : "text-emerald-700"));
  const data = sparkline?.map((y, x) => ({ x, y })) ?? [];

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-soft transition-all hover:border-slate-300 hover:shadow-elevated", className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            {icon}
            {label}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-3xl font-semibold tabular-nums text-slate-900">{value}</div>
          </div>
          {delta !== undefined && (
            <div className={cn("mt-1 inline-flex items-center gap-1 text-sm font-medium", trendColor)}>
              {delta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(delta).toFixed(1)}{deltaSuffix} <span className="font-normal text-slate-400">YoY</span>
            </div>
          )}
          {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
        </div>
        {ring && <RingScore value={ring.value} max={ring.max} label={ring.label} />}
      </div>
      {sparkline && (
        <div className="mt-4 h-12 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line type="monotone" dataKey="y" stroke="#059669" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RingScore({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = Math.min(1, value / max);
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="url(#ring-grad)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
        {label && <span className="text-[9px] uppercase text-slate-500">{label}</span>}
      </div>
    </div>
  );
}
