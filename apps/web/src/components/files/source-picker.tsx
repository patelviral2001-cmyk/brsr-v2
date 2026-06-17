"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Upload, Database, Mail, Code } from "lucide-react";
import { FileUploader } from "./file-uploader";

const TABS = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "erp", label: "Connect ERP", icon: Database },
  { id: "email", label: "Email-in", icon: Mail },
  { id: "api", label: "API", icon: Code },
];

export function SourcePicker() {
  const [active, setActive] = useState("upload");
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active === t.id ? "border-primary-700 text-primary-800" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      {active === "upload" && <FileUploader />}
      {active === "erp" && <ErpConnector />}
      {active === "email" && <EmailInBox />}
      {active === "api" && <ApiDocs />}
    </div>
  );
}

function ErpConnector() {
  const erps = [
    { name: "SAP S/4HANA", desc: "Direct OData connector. Pulls invoices, GL postings, master data." },
    { name: "Oracle Fusion ERP", desc: "REST + SCIM. Real-time AP, energy meter data." },
    { name: "Tally Prime", desc: "ODBC bridge. Daybook + Voucher extraction." },
    { name: "Microsoft D365 F&O", desc: "Power Automate connector." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {erps.map((e) => (
        <div key={e.name} className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-elevated">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Database className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900">{e.name}</div>
              <div className="text-xs text-slate-500">{e.desc}</div>
            </div>
          </div>
          <button className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:border-primary-300 hover:bg-primary-50">Connect</button>
        </div>
      ))}
    </div>
  );
}

function EmailInBox() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="text-sm font-semibold text-slate-900">Forward documents to:</div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs">ingest+imagine-powertree@brsr-ai.app</code>
        <button className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50">Copy</button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Files attached to emails sent to this address will be ingested, classified, and queued for extraction. Sender email must be on the allow-list.</p>
    </div>
  );
}

function ApiDocs() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-950 p-5 text-slate-100">
      <div className="text-xs uppercase text-slate-400">POST /api/v1/files/upload</div>
      <pre className="mt-3 overflow-x-auto text-xs leading-relaxed">
{`curl -X POST https://api.brsr-ai.com/api/v1/files/upload \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "file=@invoice.pdf" \\
  -F "scopeNodeId=node_site_blr_hq" \\
  -F "docType=INVOICE"`}
      </pre>
    </div>
  );
}
