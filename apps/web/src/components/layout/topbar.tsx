"use client";

import Link from "next/link";
import { Bell, Search, HelpCircle, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScopePicker } from "./scope-picker";
import { useCommandPaletteStore } from "@/stores/command-palette.store";
import { PeriodSelector } from "@/components/common/period-selector";
import { signOut, useSession } from "next-auth/react";
import { initials } from "@/lib/utils";

export function Topbar() {
  const setOpenPalette = useCommandPaletteStore((s) => s.setOpen);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Priya Iyer";
  const userEmail = session?.user?.email ?? "priya.iyer@imaginepowertree.com";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md">
      <ScopePicker />

      <button
        onClick={() => setOpenPalette(true)}
        className="hidden h-9 flex-1 max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white sm:flex"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search metrics, reports, files…</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Cmd K</kbd>
      </button>

      <div className="flex flex-1 sm:hidden" />

      <PeriodSelector />

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
      </Button>

      <Button variant="ghost" size="icon" asChild>
        <Link href="/copilot">
          <HelpCircle className="h-4 w-4" />
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-0.5 hover:bg-slate-50">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials(userName)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal normal-case tracking-normal">
            <div className="text-sm font-semibold text-slate-900">{userName}</div>
            <div className="text-xs text-slate-500">{userEmail}</div>
            <Badge variant="primary" className="mt-2">Group Head — Sustainability</Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/settings"><UserIcon className="mr-2 h-4 w-4" />Profile & Settings</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/settings/organization">Organization</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/settings/billing">Billing</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="text-rose-700 focus:bg-rose-50 focus:text-rose-700">
            <LogOut className="mr-2 h-4 w-4" />Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
