"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { useReport } from "@/lib/api/queries";
import { FormatIcons } from "@/components/reports/format-icons";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AlertTriangle, Download, FileBarChart2, Printer, ShieldCheck } from "lucide-react";
import { formatBytes, formatDateTime } from "@/lib/format";
import { toast } from "sonner";

export default function ReportDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { data: r, isLoading, isError, error, refetch } = useReport(id);

  if (isLoading) {
    return (<div className="p-6"><PageHeader title="Loading report…" /><PageSkeleton /></div>);
  }

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Report" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load report"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  if (!r) {
    return (
      <div className="p-6">
        <PageHeader title="Report not found" />
        <EmptyState
          icon={<FileBarChart2 className="h-6 w-6" />}
          title={`No report with id "${id}"`}
          description="It may have been deleted, or you may not have access."
          action={<Button asChild><Link href="/reports">Back to reports</Link></Button>}
        />
      </div>
    );
  }

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };
  const handleDownloadAll = () => {
    const urls = r.downloadUrls ?? {};
    const entries = Object.entries(urls).filter(([, v]) => !!v);
    if (entries.length === 0) {
      toast.warning("No downloadable files yet", {
        description: "The report bundle is still being prepared.",
      });
      return;
    }
    entries.forEach(([fmt, url], i) => {
      // Stagger to dodge browser pop-up blockers.
      setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), i * 200);
      void fmt;
    });
    toast.success(`Opening ${entries.length} file${entries.length === 1 ? "" : "s"}`);
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={r.name ?? "Report"}
        description={`${(Array.isArray(r.frameworks) ? r.frameworks : []).join(" · ")} · ${r.fy} · ${r.scopeNodeName}`}
        actions={
          <>
            <Badge variant="outline" className={cn(STATUS_COLORS?.[r.status])}>
              {r.status === "ASSURED" && <ShieldCheck className="mr-1 h-3 w-3" />}
              {r.status}
            </Badge>
            <Button variant="outline" size="sm" onClick={handlePrint} aria-label="Print this report">
              <Printer className="h-4 w-4" />Print
            </Button>
            <Button size="sm" onClick={handleDownloadAll} aria-label="Download all formats">
              <Download className="h-4 w-4" />Download All
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Cover Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-[1/1.2] w-full max-w-md rounded-xl border border-slate-200 bg-gradient-to-br from-primary-700 to-primary-950 p-8 text-white shadow-elevated">
                  <div className="flex h-full flex-col">
                    <div className="text-[10px] uppercase tracking-widest text-primary-200">{(Array.isArray(r.frameworks) ? r.frameworks : []).join(" · ")}</div>
                    <h1 className="mt-3 text-3xl font-bold leading-tight">{r.name}</h1>
                    <div className="mt-2 text-sm text-primary-200">{r.scopeNodeName}</div>
                    <div className="flex-1" />
                    <div className="text-xs text-primary-200">Generated {r.generatedAt ? formatDateTime(r.generatedAt) : "—"}</div>
                    <div className="text-xs text-primary-200">{r.generatedBy}</div>
                    {r.assuredBy && (
                      <div className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] backdrop-blur">
                        <ShieldCheck className="h-3 w-3" /> Assured by {r.assuredBy}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Downloads</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(Array.isArray(r.formats) ? r.formats : []).map((f) => {
                  const url = r.downloadUrls?.[f];
                  return url ? (
                    <a
                      key={f}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
                      aria-label={`Download ${f}`}
                    >
                      <div className="flex items-center gap-2">
                        <FormatIcons formats={[f]} />
                        <span className="text-sm font-medium text-slate-900">{f}</span>
                      </div>
                      <Download className="h-4 w-4 text-slate-400" />
                    </a>
                  ) : (
                    <div
                      key={f}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 opacity-60"
                      aria-disabled="true"
                      title={`${f} is still being generated`}
                    >
                      <div className="flex items-center gap-2">
                        <FormatIcons formats={[f]} />
                        <span className="text-sm font-medium text-slate-500">{f}</span>
                      </div>
                      <span className="text-[10px] uppercase text-slate-400">Pending</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><dt className="text-slate-500">Size</dt><dd className="font-medium text-slate-900">{formatBytes(r.sizeBytes ?? 0)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Period</dt><dd className="font-medium text-slate-900">{r.fy}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Scope</dt><dd className="font-medium text-slate-900">{r.scopeNodeName}</dd></div>
                  {r.filedAt && <div className="flex justify-between"><dt className="text-slate-500">Filed</dt><dd className="font-medium text-slate-900">{formatDateTime(r.filedAt)}</dd></div>}
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
