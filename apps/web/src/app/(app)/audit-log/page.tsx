"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/page-header";
import { useAuditLog } from "@/lib/api/queries";
import { Download, Search, ChevronDown, ChevronRight } from "lucide-react";
import { formatRelative } from "@/lib/format";
import type { AuditEvent } from "@/types";

export default function AuditLogPage() {
  const { data: events } = useAuditLog();
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = (Array.isArray(events) ? events : []).filter((e) => {
    if (actionFilter !== "all" && !(e.action ?? "").startsWith(actionFilter)) return false;
    if (q && !`${e.action ?? ""} ${e.entityName ?? ""} ${e.actorName ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const uniqueActions = Array.from(new Set((Array.isArray(events) ? events : []).map((e) => (e.action ?? "").split(".")[0])));

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Audit Log"
        description="Append-only, cryptographically-anchored activity log across your tenant"
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="h-4 w-4" />CSV</Button>
            <Button variant="outline" size="sm"><Download className="h-4 w-4" />JSONL</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions, entities…" className="pl-9" />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {uniqueActions.map((a) => <SelectItem key={a} value={a}>{a}.*</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="ghost" className="ml-auto">{filtered.length} events</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {filtered.map((e) => <TimelineRow key={e.id} ev={e} isOpen={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineRow({ ev, isOpen, onToggle }: { ev: AuditEvent; isOpen: boolean; onToggle: () => void }) {
  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
        {ev.diff ? <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`} /> : <span className="w-4" />}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-700">
          {(ev.actorName ?? "").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-medium text-slate-900">{ev.actorName}</span>
          <Badge variant="outline" size="sm" className="mx-1.5 font-mono">{ev.action}</Badge>
          <span className="text-slate-500">{ev.entityType}: <span className="font-medium text-slate-900">{ev.entityName ?? ev.entityId}</span></span>
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
