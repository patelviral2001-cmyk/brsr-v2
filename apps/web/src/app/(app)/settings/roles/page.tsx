"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { useRoles } from "@/lib/api/queries";
import { Plus, ShieldCheck } from "lucide-react";

export default function RolesPage() {
  const { data: roles } = useRoles();
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Roles & Permissions" description="Built-in roles cover most needs. Create custom roles for granular control." actions={<Button size="sm"><Plus className="h-4 w-4" />New Role</Button>} />
      <div className="grid gap-3 lg:grid-cols-2">
        {roles?.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary-700" />
                  <h3 className="text-sm font-semibold text-slate-900">{r.name}</h3>
                </div>
                <Badge variant={r.isSystem ? "outline" : "primary"} size="sm">{r.isSystem ? "System" : "Custom"}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{r.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {r.permissions.slice(0, 6).map((p) => <Badge key={p} size="sm" variant="ghost"><code>{p}</code></Badge>)}
                {r.permissions.length > 6 && <Badge size="sm" variant="ghost">+{r.permissions.length - 6}</Badge>}
              </div>
              <div className="mt-3 text-[10px] text-slate-400">{r.userCount} user{r.userCount === 1 ? "" : "s"} assigned</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
