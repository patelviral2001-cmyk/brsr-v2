"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { useTenant } from "@/lib/api/queries";

export default function OrganizationSettingsPage() {
  const { data: t } = useTenant();
  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <PageHeader title="Organization" description="Tenant-wide configuration" actions={<Button size="sm">Save changes</Button>} />
      {t && (
        <>
          <Card>
            <CardHeader><CardTitle>General</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Tenant Name" value={t.name ?? ""} />
              <Field label="Slug" value={t.slug ?? ""} />
              <Field label="Fiscal Year Start" value={`${t.fiscalYearStart ?? ""} (Apr 1 default for India)`} />
              <Field label="Reporting Currency" value={t.reportingCurrency ?? ""} />
              <Field label="Industries" value={(Array.isArray(t.industries) ? t.industries : []).join(", ")} />
              <Field label="Countries" value={(Array.isArray(t.countries) ? t.countries : []).join(", ")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <Badge variant="primary">{t.plan}</Badge>
              <span className="text-sm text-slate-700">All features enabled · 25 active users</span>
              <Button variant="outline" size="sm" className="ml-auto">Change plan</Button>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input defaultValue={value} className="mt-1.5" />
    </div>
  );
}
