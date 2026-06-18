"use client";

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, ReferenceArea, ReferenceLine, Cell } from "recharts";
import type { MaterialTopic } from "@/types";

const CATEGORY_COLOR: Record<MaterialTopic["category"], string> = {
  ENVIRONMENT: "#047857",
  SOCIAL: "#0284c7",
  GOVERNANCE: "#7c3aed",
  ECONOMIC: "#ca8a04",
};

export function MaterialityMatrix({ topics }: { topics: MaterialTopic[] }) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  const data = safeTopics.map((t) => ({
    name: t.name,
    impact: (t.impactScore ?? 0) * 100,
    financial: (t.financialScore ?? 0) * 100,
    weight: (t.stakeholderWeight ?? 0) * 100,
    category: t.category,
    priority: t.priority,
  }));

  if (data.length === 0) {
    return (
      <div
        className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400"
        role="img"
        aria-label="Empty materiality matrix"
      >
        No topics scored yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={460}>
      <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 28 }}>
        <CartesianGrid stroke="#f1f5f9" strokeDasharray="0" />
        <XAxis
          type="number"
          dataKey="impact"
          name="Impact"
          domain={[0, 100]}
          unit=""
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis type="number" dataKey="financial" name="Financial" domain={[0, 100]} unit="" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <ZAxis type="number" dataKey="weight" range={[60, 380]} name="Stakeholder Weight" />
        <ReferenceArea x1={66} x2={100} y1={66} y2={100} fill="#047857" fillOpacity={0.04} />
        <ReferenceLine x={50} stroke="#cbd5e1" strokeDasharray="4 4" />
        <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }}
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(v: number) => (v ?? 0).toFixed(0)}
          labelFormatter={() => ""}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            return (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-elevated">
                <div className="font-semibold text-slate-900">{d.name}</div>
                <div className="mt-1 text-slate-500">{d.category} · {d.priority}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  <div><div className="text-slate-400">Impact</div><div className="font-medium text-slate-700">{(d.impact ?? 0).toFixed(0)}</div></div>
                  <div><div className="text-slate-400">Financial</div><div className="font-medium text-slate-700">{(d.financial ?? 0).toFixed(0)}</div></div>
                  <div><div className="text-slate-400">SH Weight</div><div className="font-medium text-slate-700">{(d.weight ?? 0).toFixed(0)}</div></div>
                </div>
              </div>
            );
          }}
        />
        <Scatter data={data} fill="#047857">
          {data.map((d, i) => {
            const c = CATEGORY_COLOR[d.category] ?? "#94a3b8";
            return <Cell key={i} fill={c} fillOpacity={0.7} stroke={c} strokeWidth={1.5} />;
          })}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
