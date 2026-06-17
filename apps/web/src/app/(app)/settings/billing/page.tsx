"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { formatINR } from "@/lib/format";
import { Download } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <PageHeader title="Billing" description="Plan, invoices, and usage" />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Enterprise Plan</CardTitle>
              <CardDescription>Annual billing · auto-renews 1 April 2027</CardDescription>
            </div>
            <Badge variant="primary">CURRENT</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Plan price" value={formatINR(32_50_000, { compact: true })} sub="per year" />
            <Stat label="Active users" value="25" sub="of 100 included" />
            <Stat label="Entities" value="14" sub="unlimited" />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm">Upgrade</Button>
            <Button variant="outline" size="sm">View receipts</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Invoice</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { d: "01 Apr 2026", n: "INV-2026-001", a: 32_50_000, s: "PAID" },
                { d: "01 Apr 2025", n: "INV-2025-001", a: 28_40_000, s: "PAID" },
                { d: "01 Apr 2024", n: "INV-2024-001", a: 24_80_000, s: "PAID" },
              ].map((i) => (
                <tr key={i.n}>
                  <td className="px-4 py-2">{i.d}</td>
                  <td className="px-4 py-2 font-mono text-xs">{i.n}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatINR(i.a, { compact: true })}</td>
                  <td className="px-4 py-2"><Badge variant="success" size="sm">{i.s}</Badge></td>
                  <td className="px-4 py-2 text-right"><Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
