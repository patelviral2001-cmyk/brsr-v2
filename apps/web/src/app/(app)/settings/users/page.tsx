"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { DataTable, type Column } from "@/components/common/data-table";
import { useUsers } from "@/lib/api/queries";
import { initials } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { AlertTriangle, Plus, ShieldCheck, Users2 } from "lucide-react";
import type { User } from "@/types";
import { toast } from "sonner";

export default function UsersSettingsPage() {
  const { data: users, isLoading, isError, error, refetch } = useUsers();
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
  const handleInvite = () =>
    toast.info("Invite a user", {
      description: "Invite UI rolls out in v2.1. For now, send the new email to admin@brsr.ai with the desired role.",
    });

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Users" description="Manage workspace members" />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Users" description="Manage workspace members" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load users"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  // Backend `/iam/users` returns { firstName, lastName, isActive, mfaEnrolled, ... }.
  // The page's column definitions read `name / status / mfaEnabled / roles`;
  // normalise the shape here so a missing field never reaches `initials()`
  // (which crashed the page with `Cannot read properties of undefined (reading 'split')`).
  const list: User[] = (Array.isArray(users) ? users : []).map((u: any) => ({
    id: u.id,
    email: u.email ?? "",
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "—",
    avatarUrl: u.avatarUrl,
    roles: Array.isArray(u.roles)
      ? u.roles
      : Array.isArray(u.roleAssignments)
        ? u.roleAssignments.map((ra: any) => ra?.role?.name).filter(Boolean)
        : [],
    scopeIds: u.scopeIds ?? [],
    lastLoginAt: u.lastLoginAt ?? undefined,
    mfaEnabled: u.mfaEnabled ?? u.mfaEnrolled ?? false,
    status: u.status ?? (u.isActive === false ? "SUSPENDED" : u.lastLoginAt ? "ACTIVE" : "INVITED"),
  }));

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Users"
        description="Manage workspace members"
        actions={
          <Button size="sm" onClick={handleInvite} aria-label="Invite a user">
            <Plus className="h-4 w-4" />Invite
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-6 w-6" />}
          title="No users yet"
          description="Invite teammates to start collaborating."
          action={<Button onClick={handleInvite}><Plus className="h-4 w-4" />Invite</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable data={list} columns={cols} rowKey={(r) => r.id} dense />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
