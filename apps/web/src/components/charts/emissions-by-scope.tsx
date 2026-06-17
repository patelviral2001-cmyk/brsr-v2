"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#a7f3d0", "#34d399", "#047857"];

interface ScopeData {
  scope1: number;
  scope2Location: number;
  scope3: number;
}

export function EmissionsByScopeChart({ data }: { data: ScopeData }) {
  const chartData = [
    { name: "Scope 1", value: data.scope1 },
    { name: "Scope 2", value: data.scope2Location },
    { name: "Scope 3", value: data.scope3 },
  ];
  const total = chartData.reduce((a, b) => a + b.value, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => `${(v).toLocaleString("en-IN")} tCO2e`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Pie data={chartData} cx="50%" cy="50%" innerRadius={56} outerRadius={94} paddingAngle={2} dataKey="value">
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i]} stroke="#fff" strokeWidth={2} />)}
        </Pie>
        <text x="50%" y="48%" textAnchor="middle" className="fill-slate-900" fontSize="20" fontWeight="700">
          {(total / 1000).toFixed(0)}k
        </text>
        <text x="50%" y="58%" textAnchor="middle" className="fill-slate-500" fontSize="10">tCO2e total</text>
      </PieChart>
    </ResponsiveContainer>
  );
}
