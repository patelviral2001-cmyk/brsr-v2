import { format, formatDistanceToNow, parseISO } from "date-fns";

export function formatINR(amount: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (Math.abs(amount) >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
    if (Math.abs(amount) >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
    if (Math.abs(amount) >= 1e3) return `₹${(amount / 1e3).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUSD(amount: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
    if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
    if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2;
  if (opts.compact) {
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(decimals)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(decimals)}k`;
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatTonnesCO2e(tCO2e: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && tCO2e >= 1e6) return `${(tCO2e / 1e6).toFixed(2)} MtCO2e`;
  if (opts.compact && tCO2e >= 1e3) return `${(tCO2e / 1e3).toFixed(2)} ktCO2e`;
  return `${formatNumber(tCO2e, { decimals: 1 })} tCO2e`;
}

export function formatEnergy(value: number, unit: "kWh" | "MWh" | "GJ" = "MWh"): string {
  return `${formatNumber(value, { decimals: 0 })} ${unit}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDelta(value: number, opts: { suffix?: string; decimals?: number } = {}): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(opts.decimals ?? 1)}${opts.suffix ?? "%"}`;
}

export function formatDate(date: string | Date, fmt = "dd MMM yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd MMM yyyy, HH:mm");
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

export function formatFY(period: string): string {
  // period like "FY2024-25" or "2024-04-01/2025-03-31"
  if (period.startsWith("FY")) return period;
  if (period.includes("/")) {
    const [start, end] = period.split("/");
    return `FY${start.slice(2, 4)}-${end.slice(2, 4)}`;
  }
  return period;
}

export function deltaTrend(curr: number, prev: number): { delta: number; pct: number; up: boolean } {
  const delta = curr - prev;
  const pct = prev === 0 ? 0 : (delta / prev) * 100;
  return { delta, pct, up: delta >= 0 };
}
