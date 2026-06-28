"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common/page-header";
import { useTenant, useUpdateTenantSettings } from "@/lib/api/queries";
import { toast } from "sonner";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_COLOR = "#047857";

export default function BrandingPage() {
  const { data: t } = useTenant();
  const update = useUpdateTenantSettings();
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  // Sync local form state when the tenant query resolves. Without this,
  // useState's lazy initializer captures undefined on first render and the
  // inputs stay on the defaults forever even after the API responds.
  useEffect(() => {
    if (touched) return;
    if (t?.primaryColor) setColor(t.primaryColor);
    if (t?.name) setName(t.name);
  }, [t?.primaryColor, t?.name, touched]);

  const colorValid = HEX.test(color);
  const nameValid = name.trim().length >= 2 && name.trim().length <= 80;
  const canSave = colorValid && nameValid && !update.isPending;

  const onSave = () => {
    if (!canSave) {
      toast.warning("Fix the highlighted fields first.");
      return;
    }
    update.mutate(
      { name: name.trim(), primaryColor: color },
      {
        onSuccess: () => {
          toast.success("Branding saved");
          setTouched(false);
        },
        onError: (err) =>
          toast.error("Couldn't save branding", {
            description: err instanceof Error ? err.message : "Try again",
          }),
      },
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <PageHeader
        title="Branding"
        description="Customize your tenant's appearance, report cover and email templates"
        actions={
          <Button size="sm" onClick={onSave} disabled={!canSave} aria-label="Save branding">
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brand-name">Tenant Name</Label>
            <Input
              id="brand-name"
              className="mt-1.5"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
              maxLength={80}
              aria-invalid={!nameValid && name.length > 0}
              aria-describedby="brand-name-error"
            />
            {!nameValid && name.length > 0 && (
              <p id="brand-name-error" className="mt-1 text-xs text-rose-700">
                Name must be 2–80 characters.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="brand-color">Primary Color</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="brand-color"
                type="color"
                value={colorValid ? color : DEFAULT_COLOR}
                onChange={(e) => {
                  setColor(e.target.value);
                  setTouched(true);
                }}
                className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                aria-label="Pick primary color"
              />
              <Input
                aria-label="Primary color hex"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setTouched(true);
                }}
                className="font-mono"
                aria-invalid={!colorValid}
                aria-describedby="brand-color-error"
              />
            </div>
            {!colorValid && (
              <p id="brand-color-error" className="mt-1 text-xs text-rose-700">
                Enter a valid hex color like #047857.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Report Cover Preview</CardTitle></CardHeader>
        <CardContent>
          <div
            className="aspect-[1/1.2] max-w-md rounded-xl p-8 text-white shadow-elevated"
            style={{
              background: `linear-gradient(135deg, ${colorValid ? color : DEFAULT_COLOR} 0%, ${colorValid ? color : DEFAULT_COLOR}cc 100%)`,
            }}
          >
            <div className="text-[10px] uppercase tracking-widest opacity-70">BRSR · BRSR Core</div>
            <h1 className="mt-3 text-3xl font-bold">Business Responsibility & Sustainability Report</h1>
            <div className="mt-2 text-sm opacity-90">{name || "Your tenant name"}</div>
            <div className="mt-32 text-xs opacity-80">FY24-25 · Generated by BRSR AI</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
