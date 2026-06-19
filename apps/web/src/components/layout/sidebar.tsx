"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, FileSearch, Database, BarChart3, FileText,
  ShieldCheck, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: NavItem[] = [
  { href: "/home",      label: "Home",      icon: Home },
  { href: "/evidence",  label: "Evidence",  icon: FileSearch },
  { href: "/data-hub",  label: "Data Hub",  icon: Database },
  { href: "/insights",  label: "Insights",  icon: BarChart3 },
  { href: "/reports",   label: "Reports",   icon: FileText },
  { href: "/assurance", label: "Assurance", icon: ShieldCheck },
  { href: "/admin",     label: "Admin",     icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex h-screen w-[240px] flex-col border-r border-ink-300/50 bg-paper-0">
      <Link href="/home" className="flex items-center gap-2 px-6 h-[56px] border-b border-ink-300/50">
        <span className="grid place-items-center h-7 w-7 rounded-md bg-navy-900 text-lime-500 font-bold text-sm">◆</span>
        <span className="font-semibold tracking-tight text-ink-900">THE ESG</span>
      </Link>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors focus-ring",
                active
                  ? "bg-lime-50 text-ink-900 font-medium"
                  : "text-ink-700 hover:bg-paper-50 hover:text-ink-900"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-lime-700" : "text-ink-500")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-3 border-t border-ink-300/50 text-[11px] text-ink-500">
        AI Native Sustainability OS
      </div>
    </aside>
  );
}
