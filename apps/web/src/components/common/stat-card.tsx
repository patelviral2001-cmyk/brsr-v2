import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  hint?: string;
  positiveIsGood?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, delta, deltaSuffix = "%", hint, positiveIsGood = true, icon, className }: StatCardProps) {
  const trendColor = delta === undefined ? "" : (delta >= 0 ? (positiveIsGood ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50") : (positiveIsGood ? "text-rose-700 bg-rose-50" : "text-emerald-700 bg-emerald-50"));
  return (
    <div className={cn("group rounded-xl border border-slate-200 bg-white p-5 shadow-soft transition-all hover:border-slate-300 hover:shadow-elevated", className)}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
        {icon && <div className="text-slate-400 group-hover:text-primary-700">{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
        {delta !== undefined && (
          <div className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium", trendColor)}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}{deltaSuffix}
          </div>
        )}
      </div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
