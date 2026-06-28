"use client";
import { ChevronRight } from "lucide-react";
import { useScopeStore } from "@/stores/scope.store";

export function ScopeBreadcrumb() {
  const breadcrumb = useScopeStore((s) => s.breadcrumb);
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      {breadcrumb.map((b, i) => (
        <span key={b.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
          <span className={i === breadcrumb.length - 1 ? "font-medium text-slate-900" : ""}>{b.name}</span>
        </span>
      ))}
    </nav>
  );
}
