"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { useEmissionsOverview } from "@/lib/api/queries";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatTonnesCO2e } from "@/lib/format";

export default function Scope2Page() {
  const { data: e } = useEmissionsOverview();
  const [market, setMarket] = useState(false);

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Scope 2" description="Indirect emissions from purchased energy" />

      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <span className={`text-sm ${market ? "text-slate-400" : "font-medium text-slate-900"}`}>Location-based</span>
        <Switch
          id="scope2-method"
          checked={market}
          onCheckedChange={setMarket}
          aria-label="Toggle accounting method between location-based and market-based"
        />
        <Label htmlFor="scope2-method" className={`text-sm ${market ? "font-medium text-slate-900" : "text-slate-400"}`}>
          Market-based
        </Label>
        <Badge variant="primary" className="ml-auto">
          {e ? formatTonnesCO2e((market ? e.scope2Market : e.scope2Location) ?? 0) : "—"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{market ? "Market-based" : "Location-based"} accounting</CardTitle>
          <CardDescription>
            {market
              ? "Reflects contractual instruments (RECs, PPAs) — your actual procurement choices."
              : "Uses grid-average emission factors — what you'd be responsible for at default."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">
            {market
              ? "5,840 MWh of RECs were procured in FY24-25, reducing Scope 2 (market) emissions by 4,490 tCO2e vs location-based accounting."
              : "Grid emission factor used: 0.769 kgCO2e/kWh (CEA v20)."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>REC Contracts</CardTitle>
          <CardDescription>Active renewable energy certificates</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2">Counterparty</th>
                <th className="py-2">Vintage</th>
                <th className="py-2 text-right">MWh</th>
                <th className="py-2 text-right">Cost (INR)</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100"><td className="py-2 font-medium">IEX Green Market</td><td>2024</td><td className="text-right tabular-nums">3,200</td><td className="text-right tabular-nums">₹ 38,40,000</td><td><Badge size="sm" variant="success">RETIRED</Badge></td></tr>
              <tr className="border-b border-slate-100"><td className="py-2 font-medium">CleanMax PPA</td><td>2024</td><td className="text-right tabular-nums">2,640</td><td className="text-right tabular-nums">₹ 31,68,000</td><td><Badge size="sm" variant="success">RETIRED</Badge></td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
