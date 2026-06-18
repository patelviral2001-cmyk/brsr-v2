"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { useRoles } from "@/lib/api/queries";
import { AlertTriangle, Plus, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function RolesPage() {
  const { data: roles, isLoading, isError, error, refetch } = useRoles();

  const handleNew = () =>
    toast.info("Custom roles", {
      description: "Custom roles ship in v2.1. Built-in roles already cover most use cases.",
    });

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Roles & Permissions" description="Built-in roles cover most needs." />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader title="Roles & Permissions" description="Built-in roles cover most needs." />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load roles"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  const list = Array.isArray(roles) ? roles : [];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Roles & Permissions"
        description="Built-in roles cover most needs. Create custom roles for granular control."
        actions={
          <Button size="sm" onClick={handleNew} aria-label="Create new role">
            <Plus className="h-4 w-4" />New Role
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-6 w-6" />}
          title="No roles configured"
          description="Default roles will appear once your tenant is provisioned."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => {
            const perms = Array.isArray(r.permissions) ? r.permissions : [];
            const userCount = r.userCount ?? 0;
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary-700" />
                      <h3 className="text-sm font-semibold text-slate-900">{r.name}</h3>
                    </div>
                    <Badge variant={r.isSystem ? "outline" : "primary"} size="sm">
                      {r.isSystem ? "System" : "Custom"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{r.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {perms.slice(0, 6).map((p) => (
                      <Badge key={p} size="sm" variant="ghost"><code>{p}</code></Badge>
                    ))}
                    {perms.length > 6 && <Badge size="sm" variant="ghost">+{perms.length - 6}</Badge>}
                  </div>
                  <div className="mt-3 text-[10px] text-slate-400">
                    {userCount} user{userCount === 1 ? "" : "s"} assigned
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
