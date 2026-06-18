"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { Button } from "@/components/ui/button";
import { NodeCard } from "@/components/hierarchy/node-card";
import { useHierarchyNode } from "@/lib/api/queries";
import { AlertTriangle, Network } from "lucide-react";

export default function HierarchyNodeDetailPage() {
  const params = useParams();
  const nodeId = String(params?.nodeId ?? "");
  const { data: node, isLoading, isError, error, refetch, isFetching } = useHierarchyNode(nodeId);

  if (isLoading) {
    return (
      <div className="p-6">
        <PageHeader title="Loading node…" />
        <PageSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Node detail" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load this node"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()} disabled={isFetching}>Try again</Button>}
        />
      </div>
    );
  }

  if (!node) {
    return (
      <div className="p-6">
        <PageHeader title="Node not found" />
        <EmptyState
          icon={<Network className="h-6 w-6" />}
          title={`No node with id "${nodeId}"`}
          description="It may have been archived or you may not have access."
          action={
            <Button asChild>
              <Link href="/hierarchy">Back to hierarchy</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title={node.name ?? "Node detail"} description={node.code ?? undefined} />
      <NodeCard node={node} />
    </div>
  );
}
