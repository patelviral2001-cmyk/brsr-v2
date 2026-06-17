"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { WalkthroughViewer } from "@/components/assurance/walkthrough-viewer";
import { useSnapshots } from "@/lib/api/queries";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Hash } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function SnapshotDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { data: snapshots } = useSnapshots();
  const s = snapshots?.find((x) => x.id === id);

  return (
    <div className="p-6 space-y-5">
      <PageHeader title={`Snapshot ${s?.fy ?? id}`} description={`${s?.framework ?? ""} · ${s?.metricCount ?? 0} metrics`} />
      {s && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Snapshot Hash</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Hash className="h-3 w-3" /> Anchor
                </div>
                <code className="mt-1 block break-all text-xs font-mono text-slate-900">{s.hashAnchor}</code>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <Hash className="h-3 w-3" /> Root
                </div>
                <code className="mt-1 block break-all text-xs font-mono text-slate-900">{s.rootHash}</code>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Status</span><Badge variant="outline" className={cn(STATUS_COLORS[s.status])}>{s.status}</Badge></div>
                <div className="flex justify-between"><span className="text-slate-500">Created</span><span>{formatDate(s.createdAt)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">By</span><span>{s.createdBy}</span></div>
                {s.assuranceProvider && <div className="flex justify-between"><span className="text-slate-500">Provider</span><span>{s.assuranceProvider}</span></div>}
                {s.signedAt && <div className="flex justify-between"><span className="text-slate-500">Signed</span><span>{formatDate(s.signedAt)}</span></div>}
                {s.opinionStatus && <div className="flex justify-between"><span className="text-slate-500">Opinion</span><Badge variant="success" size="sm">{s.opinionStatus}</Badge></div>}
              </div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Walkthrough</CardTitle></CardHeader>
            <CardContent><WalkthroughViewer /></CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
