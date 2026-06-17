"use client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "lucide-react";
import { formatDate } from "@/lib/format";

interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange?: (range: { from: string; to: string }) => void;
}

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "FY25-26 (Q1)", days: 90 },
  { label: "FY24-25 (full)", days: 365 },
];

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="h-4 w-4" />
          {from && to ? `${formatDate(from, "dd MMM")} – ${formatDate(to, "dd MMM yyyy")}` : "Select range"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-100"
              onClick={() => {
                const to = new Date();
                const from = new Date();
                from.setDate(from.getDate() - p.days);
                onChange?.({ from: from.toISOString(), to: to.toISOString() });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
