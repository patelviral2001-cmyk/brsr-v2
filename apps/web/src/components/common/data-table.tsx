"use client";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  align?: "left" | "right" | "center";
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  rowKey: (row: T, idx: number) => string;
  emptyMessage?: string;
  className?: string;
  dense?: boolean;
}

export function DataTable<T>({ data, columns, onRowClick, rowKey, emptyMessage = "No data", className, dense }: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const sorted = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [data, sortKey, sortDir]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={cn(
                    "px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.align !== "right" && c.align !== "center" && "text-left",
                    c.sortable && "cursor-pointer select-none hover:text-slate-700",
                    c.className
                  )}
                  style={{ width: c.width }}
                  onClick={() => {
                    if (!c.sortable) return;
                    if (sortKey === String(c.key)) setSortDir(sortDir === "asc" ? "desc" : "asc");
                    else { setSortKey(String(c.key)); setSortDir("asc"); }
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortable && sortKey === String(c.key) && (
                      sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => (
              <tr
                key={rowKey(row, idx)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-slate-50"
                )}
              >
                {columns.map((c) => (
                  <td
                    key={String(c.key)}
                    className={cn(
                      dense ? "px-4 py-2 text-xs" : "px-4 py-3 text-sm",
                      "text-slate-700",
                      c.align === "right" && "text-right tabular-nums",
                      c.align === "center" && "text-center",
                      c.className
                    )}
                  >
                    {c.cell ? c.cell(row) : String((row as Record<string, unknown>)[c.key as string] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
