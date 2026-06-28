"use client";

import { useMemo } from "react";
import { hierarchy, tree as d3tree } from "d3-hierarchy";
import type { HierarchyNode } from "@/types";

const COLORS: Record<string, string> = {
  GROUP: "#064e3b",
  LEGAL_ENTITY: "#047857",
  BUSINESS_UNIT: "#059669",
  SITE: "#10b981",
  DEPARTMENT: "#34d399",
};

export function OrgHierarchyRadial({ root, size = 720 }: { root: HierarchyNode; size?: number }) {
  const layout = useMemo(() => {
    if (!root) return null;
    const h = hierarchy(root, (d) => d.children ?? []);
    const radius = size / 2 - 80;
    const treeLayout = d3tree<HierarchyNode>().size([2 * Math.PI, radius]).separation((a, b) => (a.parent === b.parent ? 1 : 2) / (a.depth || 1));
    return treeLayout(h);
  }, [root, size]);
  if (!layout) return <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" />;

  const cx = size / 2, cy = size / 2;
  const polar = (angle: number, r: number): [number, number] => [Math.cos(angle - Math.PI / 2) * r + cx, Math.sin(angle - Math.PI / 2) * r + cy];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
      {layout.links().map((l, i) => {
        const [sx, sy] = polar((l.source as { x: number }).x, (l.source as { y: number }).y);
        const [tx, ty] = polar((l.target as { x: number }).x, (l.target as { y: number }).y);
        const mxs = (l.source as { y: number }).y, mxe = (l.target as { y: number }).y;
        const ang = (l.source as { x: number }).x;
        const [m1x, m1y] = polar(ang, (mxs + mxe) / 2);
        return <path key={i} d={`M${sx},${sy}C${m1x},${m1y} ${m1x},${m1y} ${tx},${ty}`} stroke="#cbd5e1" strokeWidth={1} fill="none" opacity={0.6} />;
      })}
      {layout.descendants().map((n, i) => {
        const [x, y] = polar((n as { x: number }).x, (n as { y: number }).y);
        const fill = COLORS[n.data.type] ?? "#94a3b8";
        const r = 6 - n.depth;
        return (
          <g key={i} transform={`translate(${x},${y})`}>
            <circle r={Math.max(3, r)} fill={fill} stroke="#fff" strokeWidth={2}>
              <title>{n.data.name}</title>
            </circle>
            {n.depth <= 2 && (
              <text dx={9} dy={3} fontSize={n.depth === 0 ? 11 : 10} fontWeight={n.depth === 0 ? 700 : 500} fill="#334155">
                {n.data.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
