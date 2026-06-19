import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/**
 * Take a possibly-cuid identifier and render a customer-friendly short tag
 * (e.g. `cmqhxlui40002o01btz2p939m` → `id/2p939m`). Use for raw IDs that
 * leak into the UI when a join hasn't been resolved.
 */
export function shortId(id: string | null | undefined, prefix = "id"): string {
  if (typeof id !== "string" || !id.trim()) return "—";
  const tail = id.replace(/[^a-z0-9]/gi, "").slice(-6);
  return tail ? `${prefix}/${tail}` : "—";
}

/**
 * Resolve a user id against a list (`{id, firstName, lastName, email, name?}`)
 * and return the best display name. Falls back to `shortId(id, "user")`.
 */
export function userLabel(
  id: string | null | undefined,
  users: Array<any> | null | undefined,
): string {
  if (!id) return "system";
  const list = Array.isArray(users) ? users : [];
  const u = list.find((u) => u?.id === id) as any;
  if (u) {
    return (
      u.name ||
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      u.email ||
      shortId(id, "user")
    );
  }
  return shortId(id, "user");
}

export function initials(name: unknown): string {
  // Defensive — callers used to crash with "Cannot read properties of
  // undefined (reading 'split')" when the API didn't supply a name.
  if (typeof name !== "string" || !name.trim()) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error("Clipboard not available"));
}
