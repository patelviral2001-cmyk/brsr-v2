"use client";

import { Badge } from "@/components/ui/badge";
import { FRAMEWORKS } from "@/lib/constants";

interface FrameworkRef { id: string; ref: string }

export function FrameworkBadges({ frameworks, max = 4 }: { frameworks?: FrameworkRef[] | null; max?: number }) {
  // Some registry entries arrive without a `frameworks` array (older seed
  // rows, or canonical metrics not yet mapped). Without this guard the
  // page would crash with "Cannot read properties of undefined (reading
  // 'slice')" — the exact error reported on /metrics in production.
  const safe = Array.isArray(frameworks) ? frameworks : [];
  if (safe.length === 0) return null;
  const visible = safe.slice(0, max);
  const overflow = safe.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((f) => {
        const fw = FRAMEWORKS.find((x) => x.id === f.id);
        return (
          <Badge
            key={f.id + f.ref}
            size="sm"
            style={fw ? { borderColor: `${fw.color}40`, color: fw.color, background: `${fw.color}0c` } : undefined}
          >
            {fw?.name ?? f.id} <span className="opacity-60">{f.ref}</span>
          </Badge>
        );
      })}
      {overflow > 0 && <Badge size="sm" variant="outline">+{overflow}</Badge>}
    </div>
  );
}
