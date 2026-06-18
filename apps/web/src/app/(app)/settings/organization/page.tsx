"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { useTenant, useUpdateTenantSettings } from "@/lib/api/queries";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

interface OrgForm {
  name: string;
  slug: string;
  fiscalYearStart: string;
  reportingCurrency: string;
  industries: string;
  countries: string;
}

export default function OrganizationSettingsPage() {
  const { data: t, isLoading, isError, error, refetch } = useTenant();
  const update = useUpdateTenantSettings();
  const [form, setForm] = useState<OrgForm>({
    name: "",
    slug: "",
    fiscalYearStart: "",
    reportingCurrency: "",
    industries: "",
    countries: "",
  });
  const [touched, setTouched] = useState(false);

  // Sync form once when tenant resolves; do not stomp user edits afterward.
  useEffect(() => {
    if (touched || !t) return;
    setForm({
      name: t.name ?? "",
      slug: t.slug ?? "",
      fiscalYearStart: t.fiscalYearStart ?? "",
      reportingCurrency: t.reportingCurrency ?? "",
      industries: (Array.isArray(t.industries) ? t.industries : []).join(", "),
      countries: (Array.isArray(t.countries) ? t.countries : []).join(", "),
    });
  }, [t, touched]);

  const set = <K extends keyof OrgForm>(k: K, v: OrgForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched(true);
  };

  // Lightweight validation — no external schema lib required.
  const errors = {
    name: form.name.trim().length < 2 ? "Name must be at least 2 characters" : "",
    slug: /^[a-z0-9-]{2,}$/i.test(form.slug) ? "" : "Slug must be 2+ letters/numbers/dashes",
    reportingCurrency: /^[A-Z]{3}$/.test(form.reportingCurrency)
      ? ""
      : "Use a 3-letter ISO 4217 currency code",
  };
  const canSave =
    !errors.name && !errors.slug && !errors.reportingCurrency && touched && !update.isPending;

  const onSave = () => {
    if (!canSave) {
      toast.warning("Fix the highlighted fields first.");
      return;
    }
    update.mutate(
      {
        name: form.name.trim(),
        slug: form.slug.trim(),
        fiscalYearStart: form.fiscalYearStart.trim(),
        reportingCurrency: form.reportingCurrency.trim().toUpperCase(),
        industries: form.industries.split(",").map((s) => s.trim()).filter(Boolean),
        countries: form.countries.split(",").map((s) => s.trim()).filter(Boolean),
      },
      {
        onSuccess: () => {
          toast.success("Organization settings saved");
          setTouched(false);
        },
        onError: (err) =>
          toast.error("Couldn't save", {
            description: err instanceof Error ? err.message : "Try again",
          }),
      },
    );
  };

  if (isLoading) {
    return (<div className="p-6"><PageHeader title="Organization" /><PageSkeleton /></div>);
  }

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Organization" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load organization"
          description={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <PageHeader
        title="Organization"
        description="Tenant-wide configuration"
        actions={
          <Button size="sm" onClick={onSave} disabled={!canSave} aria-label="Save changes">
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />
      <Card>
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="org-name"
            label="Tenant Name"
            value={form.name}
            onChange={(v) => set("name", v)}
            error={touched ? errors.name : ""}
          />
          <Field
            id="org-slug"
            label="Slug"
            value={form.slug}
            onChange={(v) => set("slug", v)}
            error={touched ? errors.slug : ""}
          />
          <Field
            id="org-fy"
            label="Fiscal Year Start"
            value={form.fiscalYearStart}
            onChange={(v) => set("fiscalYearStart", v)}
            placeholder="Apr 1"
          />
          <Field
            id="org-currency"
            label="Reporting Currency"
            value={form.reportingCurrency}
            onChange={(v) => set("reportingCurrency", v.toUpperCase())}
            error={touched ? errors.reportingCurrency : ""}
            placeholder="INR"
          />
          <Field
            id="org-industries"
            label="Industries (comma-separated)"
            value={form.industries}
            onChange={(v) => set("industries", v)}
          />
          <Field
            id="org-countries"
            label="Countries (comma-separated)"
            value={form.countries}
            onChange={(v) => set("countries", v)}
          />
        </CardContent>
      </Card>
      {t && (
        <>
          <Card>
            <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <Badge variant="primary">{t.plan ?? "—"}</Badge>
              <span className="text-sm text-slate-700">All features enabled · 25 active users</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => toast.info("Plan changes", { description: "Contact billing@brsr.ai to upgrade your plan." })}
                aria-label="Change plan"
              >
                Change plan
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Feature Flags</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {Object.entries(t.featureFlags ?? {}).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <code className="text-xs text-slate-600">{k}</code>
                  <Badge variant={v ? "success" : "outline"} size="sm">{v ? "ON" : "OFF"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}

function Field({ id, label, value, onChange, placeholder, error }: FieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
