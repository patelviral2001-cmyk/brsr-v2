"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { useFrameworks } from "@/lib/api/queries";
import { FRAMEWORKS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { CalendarClock, FileBarChart2 } from "lucide-react";

export default function FrameworksPage() {
  const { data: frameworks } = useFrameworks();

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Frameworks"
        description="Track multi-framework readiness across BRSR, GRI, SASB, TCFD, IFRS S2 and CSRD"
        actions={<Button size="sm" asChild><Link href="/reports/generate"><FileBarChart2 className="h-4 w-4" />Generate Report</Link></Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {frameworks?.map((f) => {
          const meta = FRAMEWORKS.find((x) => x.id === f.id);
          return (
            <Link key={f.id} href={`/frameworks/${f.id}`}>
              <Card className="cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm" style={{ background: meta?.color ?? "#047857" }} />
                        <span className="text-xs uppercase tracking-wider text-slate-500">{meta?.regulator}</span>
                      </div>
                      <h3 className="mt-1 text-lg font-bold text-slate-900">{f.name}</h3>
                      <p className="text-xs text-slate-500">{f.fullName}</p>
                    </div>
                    <CompletionRing value={f.completionPct} color={meta?.color ?? "#047857"} />
                  </div>
                  <div className="mt-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Answered</span>
                      <span className="font-semibold tabular-nums text-slate-900">{f.answered} / {f.total}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Status</span>
                      <Badge variant={f.status === "ON_TRACK" ? "success" : f.status === "AT_RISK" ? "warning" : "danger"} size="sm">
                        {f.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {f.deadline && (
                      <div className="flex items-center gap-1 text-slate-500">
                        <CalendarClock className="h-3 w-3" />
                        <span>Due {formatRelative(f.deadline)}</span>
                      </div>
                    )}
                    <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                      Last updated {formatRelative(f.lastUpdated)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CompletionRing({ value, color }: { value: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = c * (value / 100);
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} stroke="#e2e8f0" strokeWidth={5} fill="none" />
        <circle cx="28" cy="28" r={r} stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" strokeDasharray={`${dash} ${c - dash}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums" style={{ color }}>{value}%</div>
    </div>
  );
}
