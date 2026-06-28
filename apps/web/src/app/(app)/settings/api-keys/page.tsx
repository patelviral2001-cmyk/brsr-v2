"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { Plus, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

const KEYS = [
  { id: "ak_001", name: "Prod CI/CD", prefix: "brsr_live_38a…", createdBy: "Priya Iyer", createdAt: "2025-09-12", lastUsed: "2 hours ago", scopes: ["files:write", "metrics:write"] },
  { id: "ak_002", name: "Power BI Connector", prefix: "brsr_live_8c1…", createdBy: "Arjun Menon", createdAt: "2025-11-04", lastUsed: "1 day ago", scopes: ["metrics:read", "reports:read"] },
  { id: "ak_003", name: "Vendor Webhook", prefix: "brsr_live_a45…", createdBy: "Priya Iyer", createdAt: "2026-02-21", lastUsed: "3 days ago", scopes: ["files:write"] },
];

export default function ApiKeysPage() {
  const handleCreate = () =>
    toast.info("Create API key", {
      description: "The key generator opens in a secure modal in v2.1. Contact admin for now.",
    });
  const handleCopy = async (prefix: string) => {
    try {
      await navigator.clipboard.writeText(prefix);
      toast.success("Copied prefix to clipboard");
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };
  const handleRevoke = (name: string) =>
    toast.warning(`Revoke "${name}"?`, {
      description: "Revocation is irreversible — wire up a confirmation modal in v2.1.",
    });

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="API Keys"
        description="Programmatic access tokens (Bearer)"
        actions={
          <Button size="sm" onClick={handleCreate} aria-label="Create API key">
            <Plus className="h-4 w-4" />Create Key
          </Button>
        }
      />
      <Card>
        <CardContent className="divide-y divide-slate-100 p-0">
          {KEYS.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-700"><KeyRound className="h-4 w-4" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{k.name}</span>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{k.prefix}</code>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-700"
                    onClick={() => handleCopy(k.prefix)}
                    aria-label={`Copy ${k.name} key prefix`}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">By {k.createdBy} on {k.createdAt} · Last used {k.lastUsed}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">{(Array.isArray(k.scopes) ? k.scopes : []).map((s) => <Badge size="sm" variant="ghost" key={s}>{s}</Badge>)}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleRevoke(k.name)} aria-label={`Revoke ${k.name}`}>
                Revoke
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
