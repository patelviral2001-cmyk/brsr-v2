"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatTonnesCO2e } from "@/lib/format";

const SCOPE1_DATA = [
  { source: "Stationary (DG)", value: 308, color: "#047857" },
  { source: "Mobile fleet", value: 122, color: "#0284c7" },
  { source: "Process emissions", value: 38, color: "#7c3aed" },
  { source: "Fugitive (refrigerants)", value: 14, color: "#ca8a04" },
];

export default function Scope1Page() {
  const total = SCOPE1_DATA.reduce((a, b) => a + b.value, 0);
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Scope 1" description="Direct emissions from owned/controlled sources" />
      <Card>
        <CardHeader>
          <CardTitle>Sub-source breakdown</CardTitle>
          <CardDescription>{formatTonnesCO2e(total)} total · FY24-25</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={SCOPE1_DATA} layout="vertical" margin={{ left: 24, right: 24 }}>
              <CartesianGrid stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="source" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={160} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => `${v.toLocaleString("en-IN")} tCO2e`} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {SCOPE1_DATA.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
