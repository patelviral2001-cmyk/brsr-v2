"use client";
import { useScopeStore } from "@/stores/scope.store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FY_OPTIONS = ["FY25-26", "FY24-25", "FY23-24", "FY22-23"];

export function PeriodSelector() {
  const fy = useScopeStore((s) => s.fy);
  const setFY = useScopeStore((s) => s.setFY);
  return (
    <Select value={fy} onValueChange={setFY}>
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FY_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
