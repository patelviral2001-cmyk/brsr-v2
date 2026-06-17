"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface DataPoint {
  month: string;
  scope1: number;
  scope2: number;
  scope3: number;
}

export function EmissionsTrendChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-s1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#a7f3d0" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="grad-s2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="grad-s3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#047857" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#047857" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f1f5f9" strokeDasharray="0" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
        <Tooltip
          contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: "#475569", fontWeight: 600 }}
          formatter={(v: number, name) => [`${v.toLocaleString("en-IN")} tCO2e`, String(name)]}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="scope3" stackId="1" stroke="#047857" strokeWidth={2} fill="url(#grad-s3)" name="Scope 3" />
        <Area type="monotone" dataKey="scope2" stackId="1" stroke="#10b981" strokeWidth={2} fill="url(#grad-s2)" name="Scope 2" />
        <Area type="monotone" dataKey="scope1" stackId="1" stroke="#34d399" strokeWidth={2} fill="url(#grad-s1)" name="Scope 1" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
