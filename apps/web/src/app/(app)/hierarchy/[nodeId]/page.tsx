"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { NodeCard } from "@/components/hierarchy/node-card";
import { useHierarchyNode } from "@/lib/api/queries";

export default function HierarchyNodeDetailPage() {
  const params = useParams();
  const nodeId = String(params?.nodeId ?? "");
  const { data: node } = useHierarchyNode(nodeId);
  return (
    <div className="p-6">
      <PageHeader title={node?.name ?? "Node detail"} description={node?.code} />
      {node && <NodeCard node={node} />}
    </div>
  );
}
