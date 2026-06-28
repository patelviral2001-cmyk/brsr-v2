"use client";
import { FRAMEWORKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface FrameworkSelectorProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function FrameworkSelector({ value, onChange }: FrameworkSelectorProps) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {FRAMEWORKS.map((f) => {
        const selected = value.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => toggle(f.id)}
            className={cn(
              "flex items-center justify-between rounded-lg border p-3 text-left transition-all",
              selected ? "border-primary-300 bg-primary-50 shadow-glow-emerald" : "border-slate-200 bg-white hover:border-slate-300"
            )}
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">{f.name}</div>
              <div className="text-xs text-slate-500">{f.fullName}</div>
            </div>
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border",
                selected ? "border-primary bg-primary text-white" : "border-slate-300"
              )}
            >
              {selected && <Check className="h-3 w-3" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
