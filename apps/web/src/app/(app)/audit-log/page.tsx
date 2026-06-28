"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useAuditLog, useUsers } from "@/lib/api/queries";
import { Download, Search, ChevronDown, ScrollText, AlertTriangle } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { userLabel, shortId } from "@/lib/utils";
import type { AuditEvent } from "@/types";
import { toast } from "sonner";

export default function AuditLogPage() {
  const { data: events, isLoading, isError, error, refetch, isFetching } = useAuditLog();
  const { data: users } = useUsers();
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // Backend `/audit/logs` returns { createdAt, actorUserId, entityId, action,
  // entityType, diff, ... }. The page reads `at, actorName, entityName`.
  // Normalise here so `formatRelative(ev.at)` can't crash on undefined.
  const list = (Array.isArray(events) ? events : []).map((e: any) => ({
    id: e.id,
    at: e.at ?? e.createdAt ?? null,
    action: e.action ?? "UNKNOWN",
    entityType: e.entityType ?? "",
    entityId: e.entityId ?? null,
    entityName: e.entityName ?? null,
    actorId: e.actorId ?? e.actorUserId ?? null,
    actorEmail: e.actorEmail ?? "",
    actorName:
      e.actorName ??
      // Resolve the actor's user id to their display name; falls back to a
      // short tag like `user/2p939m` when the user list hasn't loaded.
      userLabel(e.actorUserId, users),
    diff: e.diff,
    ip: e.ip ?? e.ipAddress ?? null,
    userAgent: e.userAgent ?? null,
  }));

  const filtered = useMemo(
    () =>
      list.filter((e) => {
        if (actionFilter !== "all" && !(e.action ?? "").startsWith(actionFilter)) return false;
        if (q && !`${e.action ?? ""} ${e.entityName ?? ""} ${e.actorName ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [list, q, actionFilter],
  );

  // Filter out empty-string actions — Radix Select crashes on value="" — and dedupe.
  const uniqueActions = useMemo(
    () =>
      Array.from(
        new Set(
          list
            .map((e) => (e.action ?? "").split(".")[0])
            .filter((a): a is string => !!a),
        ),
      ),
    [list],
  );

  const exportEvents = (fmt: "csv" | "jsonl") => {
    if (!filtered.length) {
      toast.warning("Nothing to export — adjust filters first.");
      return;
    }
    try {
      let blob: Blob;
      if (fmt === "csv") {
        const header = "at,actor,action,entityType,entityId,entityName\n";
        const rows = filtered
          .map((e) =>
            [e.at, e.actorName, e.action, e.entityType, e.entityId, e.entityName]
              .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
              .join(","),
          )
          .join("\n");
        blob = new Blob([header + rows], { type: "text/csv" });
      } else {
        blob = new Blob([filtered.map((e) => JSON.stringify(e)).join("\n")], {
          type: "application/jsonl",
        });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filtered.length} events as ${fmt.toUpperCase()}`);
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Audit Log" description="Append-only, cryptographically-anchored activity log across your tenant" />
        <TableSkeleton rows={10} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Audit Log" description="Append-only, cryptographically-anchored activity log across your tenant" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load audit log"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()} disabled={isFetching}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Audit Log"
        description="Append-only, cryptographically-anchored activity log across your tenant"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportEvents("csv")} aria-label="Export as CSV">
              <Download className="h-4 w-4" />CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportEvents("jsonl")} aria-label="Export as JSONL">
              <Download className="h-4 w-4" />JSONL
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actions, entities…"
            className="pl-9"
            aria-label="Search audit events"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-9 w-44" aria-label="Filter by action"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {uniqueActions.map((a) => <SelectItem key={a} value={a}>{a}.*</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="ghost" className="ml-auto">{filtered.length} events</Badge>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="No events match"
          description={list.length === 0 ? "Activity will appear here as your team works in the platform." : "Try clearing filters."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <TimelineRow
                  key={e.id}
                  ev={e}
                  users={users as any[] | undefined}
                  isOpen={openId === e.id}
                  onToggle={() => setOpenId(openId === e.id ? null : e.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TimelineRow({
  ev, isOpen, onToggle, users,
}: {
  ev: AuditEvent;
  isOpen: boolean;
  onToggle: () => void;
  users?: any[];
}) {
  // For User-typed entities the entityId is itself a user cuid — resolve it.
  // For everything else, render a short tag like `Document / abc123`.
  const targetLabel =
    ev.entityName ??
    (ev.entityType === "User"
      ? userLabel(ev.entityId, users)
      : shortId(ev.entityId, ev.entityType?.toLowerCase() ?? "entity"));
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
        aria-expanded={isOpen}
        aria-label={`Toggle details for ${ev.action}`}
      >
        {ev.diff ? (
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
          />
        ) : (
          <span className="w-4" />
        )}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-700">
          {(ev.actorName ?? "").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-medium text-slate-900">{ev.actorName}</span>
          <Badge variant="outline" size="sm" className="mx-1.5 font-mono">{ev.action}</Badge>
          <span className="text-slate-500">
            {ev.entityType}: <span className="font-medium text-slate-900">{targetLabel}</span>
          </span>
        </div>
        <span className="text-xs text-slate-400">{formatRelative(ev.at)}</span>
      </button>
      {isOpen && ev.diff && (
        <div className="bg-slate-50 px-4 py-3">
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs">
            {JSON.stringify(ev.diff, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
