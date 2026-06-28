"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { ChatPanel } from "@/components/copilot/chat-panel";
import { useCopilotConversations } from "@/lib/api/queries";
import { Plus, Sparkles, MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { formatRelative } from "@/lib/format";

export default function CopilotPage() {
  const router = useRouter();
  const search = useSearchParams();
  const conversationId = search?.get("c") ?? undefined;
  const { data: convos, isLoading, isError, error, refetch } = useCopilotConversations();

  return (
    <div className="p-6">
      <PageHeader
        title="Copilot"
        description="Grounded in your tenant's hierarchy, metrics, frameworks, and prior conversations"
        actions={
          <Button
            size="sm"
            onClick={() => router.push("/copilot")}
            aria-label="Start a new conversation"
          >
            <Plus className="h-4 w-4" />New conversation
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardContent className="p-3">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Recent
            </div>
            <div className="space-y-1">
              {isLoading && (
                <div className="px-2 py-3 text-xs text-slate-400">Loading conversations…</div>
              )}
              {isError && (
                <div className="rounded-md bg-rose-50 px-2 py-2 text-xs text-rose-700">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Couldn&apos;t load conversations.
                  </div>
                  <button
                    onClick={() => refetch()}
                    className="mt-1 text-[10px] underline"
                    aria-label="Retry loading conversations"
                  >
                    Try again — {error instanceof Error ? error.message : ""}
                  </button>
                </div>
              )}
              {!isLoading && !isError && (convos?.length ?? 0) === 0 && (
                <div className="px-2 py-3 text-xs text-slate-400">
                  No conversations yet — start one on the right.
                </div>
              )}
              {convos?.map((c) => (
                <Link
                  key={c.id}
                  href={`/copilot?c=${c.id}`}
                  className={`block rounded-md px-2 py-2 hover:bg-slate-50 ${conversationId === c.id ? "bg-primary-50" : ""}`}
                  aria-current={conversationId === c.id ? "page" : undefined}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{c.title}</div>
                      <div className="text-[10px] text-slate-400">{formatRelative(c.updatedAt)}</div>
                    </div>
                    <Badge size="sm" variant="ghost">{c.mode}</Badge>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-900">
                <Sparkles className="h-3 w-3" /> Tips
              </div>
              <ul className="mt-1.5 space-y-1 text-[11px] text-primary-900/80">
                <li>• Ask &quot;why is X up/down YoY?&quot;</li>
                <li>• &quot;Draft P6 narrative&quot; — uses your facts</li>
                <li>• &quot;Benchmark vs Adani Green &amp; Tata Power&quot;</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="h-[720px]">
              {isError && !convos ? (
                <EmptyState
                  icon={<AlertTriangle className="h-6 w-6" />}
                  title="Copilot is unavailable"
                  description={error instanceof Error ? error.message : "Please try again shortly."}
                  action={<Button onClick={() => refetch()}>Try again</Button>}
                />
              ) : (
                <ChatPanel key={conversationId ?? "new"} conversationId={conversationId} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
