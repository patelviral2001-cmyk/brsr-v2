"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { FileCard } from "@/components/files/file-card";
import { useFiles } from "@/lib/api/queries";
import { Search, Upload, Filter, FileText } from "lucide-react";

export default function FilesPage() {
  const { data: files } = useFiles();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!files) return [];
    return files.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (docTypeFilter !== "all" && f.docType !== docTypeFilter) return false;
      if (q && !f.filename.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [files, statusFilter, docTypeFilter, q]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Files"
        description="All evidence and source documents across your tenant"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link href="/files?source=erp"><FileText className="h-4 w-4" />ERP Sync</Link></Button>
            <Button size="sm" asChild><Link href="/files/upload"><Upload className="h-4 w-4" />Upload</Link></Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filenames…" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="NEEDS_REVIEW">Needs review</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Doc type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="INVOICE">Invoice</SelectItem>
            <SelectItem value="UTILITY_BILL">Utility bill</SelectItem>
            <SelectItem value="FUEL_RECEIPT">Fuel receipt</SelectItem>
            <SelectItem value="POLICY">Policy</SelectItem>
            <SelectItem value="AUDIT_REPORT">Audit report</SelectItem>
            <SelectItem value="ENERGY_AUDIT">Energy audit</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm"><Filter className="h-4 w-4" />More</Button>
        <Badge variant="ghost" className="ml-auto">{filtered.length} files</Badge>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No files yet"
          description="Upload your first document to start extracting ESG signals."
          action={<Button asChild><Link href="/files/upload"><Upload className="h-4 w-4" />Upload your first document</Link></Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f) => <FileCard key={f.id} file={f} />)}
        </div>
      )}
    </div>
  );
}
