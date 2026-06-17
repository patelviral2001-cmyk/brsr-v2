"use client";

import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, ComposedChart } from "recharts";

interface PathwayPoint {
  year: number;
  target: number;
  actual?: number;
  bau?: number;
}

export function NetZeroPathway({ data }: { data: PathwayPoint[] }) {
  const safe = Array.isArray(data) ? data : [];
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={safe} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="bau-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#fb7185" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${((v ?? 0) / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }} formatter={(v: number, name) => [`${((v ?? 0) / 1000).toFixed(1)}k tCO2e`, String(name)]} />
        <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="bau" stroke="#fb7185" fill="url(#bau-grad)" strokeWidth={1.5} strokeDasharray="4 4" name="BAU (No Action)" />
        <Line type="monotone" dataKey="target" stroke="#047857" strokeWidth={2.4} dot={false} name="SBTi 1.5°C Target" />
        <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2.4} dot={{ r: 4, fill: "#10b981" }} name="Actual" connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
