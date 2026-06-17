"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { SnapshotCard } from "@/components/assurance/snapshot-card";
import { WalkthroughViewer } from "@/components/assurance/walkthrough-viewer";
import { useSnapshots, useExceptions } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";

export default function AssurancePage() {
  const { data: snapshots } = useSnapshots();
  const { data: exceptions } = useExceptions();
  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Assurance"
        description="Cryptographically-sealed snapshots, traceable walkthroughs, and exception management"
        actions={<Button variant="outline" size="sm" asChild><Link href="/assurance/exceptions">Exceptions ({exceptions?.length ?? 0})</Link></Button>}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {snapshots?.map((s) => <SnapshotCard key={s.id} snapshot={s} />)}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Walkthrough</CardTitle>
              <CardDescription>End-to-end lineage from source document to filed report</CardDescription>
            </div>
            <Badge variant="primary">demo: scope 2 location</Badge>
          </div>
        </CardHeader>
        <CardContent><WalkthroughViewer /></CardContent>
      </Card>
    </div>
  );
}
