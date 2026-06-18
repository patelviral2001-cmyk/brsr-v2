"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const RENEW = ["#047857", "#059669", "#10b981", "#34d399"];
const NON_RENEW = ["#fbbf24", "#f59e0b", "#d97706"];

export function EnergyMixChart({ data }: { data: { source: string; mwh: number; renewable: boolean }[] }) {
  const safe = Array.isArray(data) ? data : [];

  if (safe.length === 0) {
    return (
      <div
        className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400"
        role="img"
        aria-label="Empty energy mix chart"
      >
        No energy mix data.
      </div>
    );
  }

  // Use a deterministic two-pass to avoid mutating counters inside .map().
  let ri = 0;
  let ni = 0;
  const colorized = safe.map((d) => ({
    ...d,
    fill: d.renewable ? RENEW[ri++ % RENEW.length] : NON_RENEW[ni++ % NON_RENEW.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => `${(v ?? 0).toLocaleString("en-IN")} MWh`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Pie data={colorized} cx="50%" cy="50%" innerRadius={48} outerRadius={88} paddingAngle={2} dataKey="mwh" nameKey="source">
          {colorized.map((d, i) => <Cell key={i} fill={d.fill} stroke="#fff" strokeWidth={2} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
