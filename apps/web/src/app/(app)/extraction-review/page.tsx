"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { ReviewQueueItem } from "@/components/extraction/review-queue-item";
import { ExtractionPreviewPane } from "@/components/extraction/extraction-preview-pane";
import {
  useExtractionQueue,
  useApproveField,
  useRejectField,
  useEditField,
} from "@/lib/api/queries";
import { AlertTriangle, Inbox, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ExtractionReviewPage() {
  const {
    data: queue,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useExtractionQueue();
  const approve = useApproveField();
  const reject = useRejectField();
  const edit = useEditField();

  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof queue>();
    (Array.isArray(queue) ? queue : [])
      .filter((f) => !q || (f.fieldLabel ?? "").toLowerCase().includes(q.toLowerCase()))
      .forEach((f) => {
        const key = f.fileName ?? "Unknown file";
        const arr = map.get(key) ?? [];
        arr.push(f);
        map.set(key, arr);
      });
    return Array.from(map.entries());
  }, [queue, q]);

  const active = queue?.find((f) => f.id === activeId) ?? queue?.[0];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <PageHeader
          title="Extraction Review"
          description="Fields below 80% confidence need human verification."
        />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader
          title="Extraction Review"
          description="Fields below 80% confidence need human verification."
        />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load review queue"
          description={
            error instanceof Error ? error.message : "Please try again."
          }
          action={
            <Button onClick={() => refetch()} disabled={isFetching}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Extraction Review"
        description="Fields below 80% confidence need human verification before they flow into metrics."
        actions={<Badge variant="primary">{queue?.length ?? 0} pending</Badge>}
      />

      {!queue?.length ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="Inbox zero"
          description="No fields awaiting review. Nice work."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="grid h-[760px] grid-cols-1 lg:grid-cols-[320px_1fr]">
              <div className="overflow-y-auto border-r border-slate-200 p-3 scrollbar-thin">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search fields…"
                    className="h-9 pl-8"
                  />
                </div>
                <div className="mt-3 space-y-3">
                  {grouped.map(([fname, items]) => (
                    <div key={fname}>
                      <div className="mb-1.5 truncate px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {fname}
                      </div>
                      <div className="space-y-1.5">
                        {items?.map((f) => (
                          <ReviewQueueItem
                            key={f.id}
                            field={f}
                            isActive={activeId === f.id}
                            onSelect={() => setActiveId(f.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {active && (
                <ExtractionPreviewPane
                  field={active}
                  isApproving={approve.isPending}
                  isRejecting={reject.isPending}
                  isEditing={edit.isPending}
                  onApprove={(id, value) =>
                    approve.mutate(
                      { id, value },
                      {
                        onSuccess: () => {
                          toast.success("Field approved");
                          setActiveId(null);
                        },
                        onError: (err) =>
                          toast.error("Couldn't approve", {
                            description:
                              err instanceof Error ? err.message : "Try again",
                          }),
                      },
                    )
                  }
                  onReject={(id, reason) =>
                    reject.mutate(
                      { id, reason },
                      {
                        onSuccess: () => {
                          toast.warning("Field rejected");
                          setActiveId(null);
                        },
                        onError: (err) =>
                          toast.error("Couldn't reject", {
                            description:
                              err instanceof Error ? err.message : "Try again",
                          }),
                      },
                    )
                  }
                  onEdit={(id, value) =>
                    edit.mutate(
                      { id, value },
                      {
                        onSuccess: () => toast.success("Field updated"),
                        onError: (err) =>
                          toast.error("Couldn't save", {
                            description:
                              err instanceof Error ? err.message : "Try again",
                          }),
                      },
                    )
                  }
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
