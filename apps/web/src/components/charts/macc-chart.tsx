"use client";

import { useMemo } from "react";
import type { AbatementProject } from "@/types";

const CATEGORY_COLOR: Record<AbatementProject["category"], string> = {
  ENERGY_EFFICIENCY: "#047857",
  RENEWABLES: "#10b981",
  FUEL_SWITCH: "#0284c7",
  PROCESS: "#7c3aed",
  OFFSETS: "#d97706",
};

export function MaccChart({ projects, height = 380 }: { projects: AbatementProject[]; height?: number }) {
  // Sort ascending by marginal cost
  const sorted = useMemo(() => [...projects].sort((a, b) => a.marginalCostINRPerTCO2e - b.marginalCostINRPerTCO2e), [projects]);
  const totalReduction = sorted.reduce((a, b) => a + b.reductionTCO2e, 0);
  const maxCost = Math.max(...sorted.map((p) => p.marginalCostINRPerTCO2e), 100);
  const minCost = Math.min(...sorted.map((p) => p.marginalCostINRPerTCO2e), -2000);
  const padding = { top: 24, right: 18, bottom: 60, left: 56 };

  return (
    <div className="w-full">
      <svg viewBox={`0 0 1000 ${height}`} className="w-full">
        {(() => {
          const w = 1000 - padding.left - padding.right;
          const h = height - padding.top - padding.bottom;
          const yZero = padding.top + h - ((0 - minCost) / (maxCost - minCost)) * h;
          const yScale = (v: number) => padding.top + h - ((v - minCost) / (maxCost - minCost)) * h;

          let xCursor = padding.left;

          // gridlines
          const ticks = 5;
          const gridLines = Array.from({ length: ticks + 1 }).map((_, i) => {
            const v = minCost + (i / ticks) * (maxCost - minCost);
            const y = yScale(v);
            return (
              <g key={i}>
                <line x1={padding.left} x2={padding.left + w} y1={y} y2={y} stroke="#f1f5f9" />
                <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">
                  {(v / 1000).toFixed(1)}k
                </text>
              </g>
            );
          });

          return (
            <>
              {gridLines}
              <line x1={padding.left} x2={padding.left + w} y1={yZero} y2={yZero} stroke="#94a3b8" strokeDasharray="3 3" />
              <text x={padding.left - 8} y={padding.top + h + 20} textAnchor="end" fontSize="10" fill="#64748b" fontWeight={600}>tCO2e →</text>
              <text x={padding.left - 44} y={padding.top + h / 2} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight={600} transform={`rotate(-90, ${padding.left - 44}, ${padding.top + h / 2})`}>₹ / tCO2e</text>
              {sorted.map((p) => {
                const barW = (p.reductionTCO2e / totalReduction) * w;
                const y = Math.min(yZero, yScale(p.marginalCostINRPerTCO2e));
                const barH = Math.abs(yZero - yScale(p.marginalCostINRPerTCO2e));
                const x = xCursor;
                xCursor += barW;
                return (
                  <g key={p.id}>
                    <rect x={x} y={y} width={Math.max(0.5, barW - 1)} height={barH} fill={CATEGORY_COLOR[p.category]} opacity={p.status === "PROPOSED" ? 0.55 : 0.95}>
                      <title>{p.name}: {p.reductionTCO2e} tCO2e at ₹{p.marginalCostINRPerTCO2e}/tCO2e</title>
                    </rect>
                  </g>
                );
              })}
              {/* x-axis cumulative ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                const x = padding.left + f * w;
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={padding.top + h} y2={padding.top + h + 4} stroke="#94a3b8" />
                    <text x={x} y={padding.top + h + 18} textAnchor="middle" fontSize="10" fill="#64748b">
                      {(f * totalReduction / 1000).toFixed(1)}k
                    </text>
                  </g>
                );
              })}
            </>
          );
        })()}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {(Object.entries(CATEGORY_COLOR) as [AbatementProject["category"], string][]).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
            <span>{k.replace("_", " ").toLowerCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
