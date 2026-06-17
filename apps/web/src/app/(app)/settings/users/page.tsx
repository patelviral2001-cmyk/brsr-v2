"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { useUsers } from "@/lib/api/queries";
import { initials } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { Plus, ShieldCheck } from "lucide-react";
import type { User } from "@/types";

export default function UsersSettingsPage() {
  const { data: users } = useUsers();
  const cols: Column<User>[] = [
    { key: "name", header: "User", cell: (r) => (
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{initials(r.name)}</AvatarFallback></Avatar>
        <div>
          <div className="text-sm font-medium text-slate-900">{r.name}</div>
          <div className="text-[10px] text-slate-500">{r.email}</div>
        </div>
      </div>
    )},
    { key: "roles", header: "Roles", cell: (r) => <div className="flex flex-wrap gap-1">{(Array.isArray(r.roles) ? r.roles : []).map((ro) => <Badge key={ro} size="sm" variant="primary">{ro}</Badge>)}</div> },
    { key: "mfaEnabled", header: "MFA", cell: (r) => r.mfaEnabled ? <Badge variant="success" size="sm"><ShieldCheck className="h-3 w-3" /> On</Badge> : <Badge variant="outline" size="sm">Off</Badge> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "ACTIVE" ? "success" : r.status === "INVITED" ? "info" : "outline"} size="sm">{r.status}</Badge> },
    { key: "lastLoginAt", header: "Last login", cell: (r) => <span className="text-xs text-slate-500">{r.lastLoginAt ? formatRelative(r.lastLoginAt) : "—"}</span> },
  ];
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Users" description="Manage workspace members" actions={<Button size="sm"><Plus className="h-4 w-4" />Invite</Button>} />
      <Card>
        <CardContent className="p-0">{Array.isArray(users) && <DataTable data={users} columns={cols} rowKey={(r) => r.id} dense />}</CardContent>
      </Card>
    </div>
  );
}
