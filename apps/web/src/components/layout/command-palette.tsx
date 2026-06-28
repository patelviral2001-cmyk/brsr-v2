"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCommandPaletteStore } from "@/stores/command-palette.store";
import {
  LayoutDashboard, Network, FileText, ScanLine, Database, Layers,
  Calculator, Factory, FileBarChart2, Compass, Users2, ShieldCheck,
  ScrollText, Sparkles, Search, Plus, Upload, Settings,
} from "lucide-react";

const COMMANDS = [
  { group: "Navigation", items: [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: Network, label: "Hierarchy", href: "/hierarchy" },
    { icon: FileText, label: "Files", href: "/files" },
    { icon: ScanLine, label: "Extraction Review", href: "/extraction-review" },
    { icon: Database, label: "Metrics", href: "/metrics" },
    { icon: Layers, label: "Frameworks", href: "/frameworks" },
    { icon: Calculator, label: "Calculations", href: "/calculations" },
    { icon: Factory, label: "Carbon Accounting", href: "/carbon" },
    { icon: FileBarChart2, label: "Reports", href: "/reports" },
    { icon: Compass, label: "Materiality", href: "/materiality" },
    { icon: Users2, label: "Suppliers", href: "/suppliers" },
    { icon: ShieldCheck, label: "Assurance", href: "/assurance" },
    { icon: ScrollText, label: "Audit Log", href: "/audit-log" },
    { icon: Sparkles, label: "Open Copilot", href: "/copilot" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ]},
  { group: "Actions", items: [
    { icon: Plus, label: "Generate New Report", href: "/reports/generate" },
    { icon: Upload, label: "Upload Documents", href: "/files/upload" },
    { icon: Plus, label: "Add Hierarchy Node", href: "/hierarchy?action=new" },
  ]},
];

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  const go = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <Command className="bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <Command.Input
              placeholder="Search or run a command…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">ESC</kbd>
          </div>
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-8 text-center text-sm text-slate-400">
              No results
            </Command.Empty>
            {COMMANDS.map((group) => (
              <Command.Group key={group.group} heading={group.group} className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-400">
                {group.items.map((item) => (
                  <Command.Item
                    key={item.label}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-primary-50 aria-selected:text-primary-900"
                  >
                    <item.icon className="h-4 w-4 text-slate-400" />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
            <span>↑↓ Navigate · ↵ Select</span>
            <span>Cmd K to toggle</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
