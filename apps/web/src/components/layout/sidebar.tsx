"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Network, FileText, ScanLine, Database,
  Layers, Calculator, Factory, FileBarChart2,
  Compass, Users2, ShieldCheck, ScrollText,
  Sparkles, ChevronLeft, ChevronRight, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app.store";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
};

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Data Ops",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/hierarchy", label: "Hierarchy", icon: Network },
      { href: "/files", label: "Files", icon: FileText, badge: 4 },
      { href: "/extraction-review", label: "Extraction Review", icon: ScanLine, badge: 12 },
      { href: "/metrics", label: "Metrics", icon: Database },
    ],
  },
  {
    title: "Reporting",
    items: [
      { href: "/frameworks", label: "Frameworks", icon: Layers },
      { href: "/calculations", label: "Calculations", icon: Calculator },
      { href: "/carbon", label: "Carbon Accounting", icon: Factory },
      { href: "/reports", label: "Reports", icon: FileBarChart2 },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/materiality", label: "Materiality", icon: Compass },
      { href: "/suppliers", label: "Suppliers", icon: Users2 },
      { href: "/assurance", label: "Assurance", icon: ShieldCheck },
      { href: "/audit-log", label: "Audit Log", icon: ScrollText },
    ],
  },
];

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const pathname = usePathname() ?? "";

  return (
    <TooltipProvider delayDuration={120}>
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.18, ease: "easeInOut" }}
        className="relative flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white"
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-glow-emerald">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-slate-900">BRSR AI</span>
              <span className="text-[10px] text-slate-500">v2 · Enterprise</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              {!collapsed && (
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  const link = (
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all",
                        active
                          ? "bg-primary-50 text-primary-800"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                        collapsed && "justify-center"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary-700")} />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {item.badge !== undefined && (
                            <span className={cn(
                              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                              active ? "bg-primary-200 text-primary-900" : "bg-slate-100 text-slate-600"
                            )}>
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                  return (
                    <li key={item.href} className="relative">
                      {active && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute left-0 top-1.5 h-6 w-0.5 rounded-r bg-primary-600"
                        />
                      )}
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : link}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Copilot - sticky-ish at bottom */}
          {!collapsed && (
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Assistant</div>
          )}
          <Link
            href="/copilot"
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all",
              pathname.startsWith("/copilot")
                ? "bg-gradient-to-r from-primary-50 via-primary-50 to-transparent text-primary-800"
                : "text-slate-600 hover:bg-slate-50",
              collapsed && "justify-center"
            )}
          >
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-700" />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse-soft" />
            </span>
            {!collapsed && <span>Copilot</span>}
          </Link>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-2">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              collapsed && "justify-center"
            )}
          >
            <Settings className="h-4 w-4" />
            {!collapsed && <span>Settings</span>}
          </Link>
          <button
            onClick={toggle}
            className={cn(
              "mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-700",
              collapsed && "justify-center"
            )}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <><ChevronLeft className="h-3.5 w-3.5" /><span>Collapse</span></>}
          </button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
