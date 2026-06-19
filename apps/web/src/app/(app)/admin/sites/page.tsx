"use client";

import { useState } from "react";
import { useSites, useCreateSite } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SITE_TYPES = [
  "OFFICE", "MANUFACTURING", "WAREHOUSE", "TOLL_PLAZA", "STREET_LIGHTING",
  "SOLAR_PLANT", "WIND_PLANT", "RETAIL", "DATA_CENTER", "OTHER",
];

export default function AdminSitesPage() {
  const { data: sites = [], isLoading } = useSites();
  const create = useCreateSite();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", externalCode: "", siteType: "OFFICE", city: "", state: "" });

  const submit = async () => {
    if (!form.name) return;
    try {
      await create.mutateAsync(form);
      toast.success(`Created ${form.name}`);
      setForm({ name: "", externalCode: "", siteType: "OFFICE", city: "", state: "" });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create site");
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-[28px] font-semibold text-ink-900">Sites</h1>
        <Button onClick={() => setOpen(true)} className="bg-lime-500 hover:bg-lime-600 text-ink-900 font-medium">
          <Plus className="h-4 w-4 mr-1" /> Add site
        </Button>
      </div>

      {open && (
        <div className="rounded-2xl border border-ink-300/50 bg-paper-0 p-6 mb-8 shadow-soft">
          <h2 className="text-[15px] font-semibold mb-4">New site</h2>
          <div className="grid grid-cols-2 gap-3 max-w-[640px]">
            <div className="col-span-2 space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Daroda Toll Plaza" />
            </div>
            <div className="space-y-1.5">
              <Label>Internal code</Label>
              <Input value={form.externalCode} onChange={(e) => setForm({ ...form, externalCode: e.target.value })} placeholder="DARODA" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select value={form.siteType} onChange={(e) => setForm({ ...form, siteType: e.target.value })}
                      className="w-full h-10 rounded-lg border border-ink-300 bg-paper-0 px-3 text-[14px] focus-ring">
                {SITE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-2 pt-2">
              <Button onClick={submit} disabled={create.isPending || !form.name}
                      className="bg-lime-500 hover:bg-lime-600 text-ink-900 font-medium">
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create site"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-ink-300/50 bg-paper-0 shadow-soft overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper-50 text-[12px] uppercase tracking-wider text-ink-500">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Code</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="text-[14px] divide-y divide-ink-300/50">
            {sites.map((s) => (
              <tr key={s.id} className="hover:bg-paper-50">
                <td className="px-4 py-3 font-medium text-ink-900">{s.name}</td>
                <td className="px-4 py-3 text-ink-700">{s.siteType.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-4 py-3 text-ink-700">{[s.city, s.state].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-ink-500">{s.externalCode ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium bg-success-50 text-success">
                    {s.status.toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && sites.length === 0 && (
              <tr><td colSpan={5} className="text-center text-ink-500 py-10">No sites yet. Add your first site to start uploading evidence.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
