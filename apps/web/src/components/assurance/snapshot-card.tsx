"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Hash, Calendar, User as UserIcon } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { AssuranceSnapshot } from "@/types";

export function SnapshotCard({ snapshot }: { snapshot: AssuranceSnapshot }) {
  return (
    <Link href={`/assurance/snapshots/${snapshot.id}`}>
      <Card className="cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary-700" />
                <span className="text-xs uppercase tracking-wider text-slate-500">{snapshot.framework}</span>
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{snapshot.fy}</h3>
            </div>
            <Badge variant="outline" className={cn(STATUS_COLORS[snapshot.status])}>{snapshot.status}</Badge>
          </div>
          <div className="mt-4 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Hash className="h-3 w-3" />
              <code className="font-mono">{snapshot.hashAnchor}</code>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Calendar className="h-3 w-3" />
              <span>Created {formatDate(snapshot.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <UserIcon className="h-3 w-3" />
              <span>By {snapshot.createdBy}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500">{snapshot.metricCount} metrics</div>
            {snapshot.opinionStatus && (
              <Badge variant={snapshot.opinionStatus === "UNQUALIFIED" ? "success" : "warning"} size="sm">
                {snapshot.opinionStatus}
              </Badge>
            )}
          </div>
          {snapshot.assuranceProvider && (
            <div className="mt-1 text-[10px] text-slate-400">Provider: {snapshot.assuranceProvider}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
