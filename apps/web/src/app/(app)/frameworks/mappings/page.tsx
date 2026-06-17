"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { useMetricRegistry } from "@/lib/api/queries";
import { FRAMEWORKS } from "@/lib/constants";

export default function MappingsPage() {
  const { data: metrics } = useMetricRegistry();
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Framework Mappings" description="Canonical metrics mapped to each framework section" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">Metric</th>
                  {FRAMEWORKS.map((f) => (
                    <th key={f.id} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">{f.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics?.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{m.name}</div>
                      <code className="text-[10px] text-slate-500">{m.canonicalKey}</code>
                    </td>
                    {FRAMEWORKS.map((f) => {
                      const map = m.frameworks.find((x) => x.id === f.id);
                      return (
                        <td key={f.id} className="px-3 py-2">
                          {map ? <Badge size="sm" variant="outline" style={{ borderColor: `${f.color}40`, color: f.color }}>{map.ref}</Badge> : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
