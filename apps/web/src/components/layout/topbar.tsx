"use client";

import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "next-auth/react";
import { initials } from "@/lib/utils";

export function Topbar() {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Priya Shah";
  const userEmail = session?.user?.email ?? "priya@theesg.in";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-300/50 bg-paper-0/80 px-6 backdrop-blur-md">
      <div className="text-[13px] text-ink-500">
        AI Native Sustainability Operating System
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-0.5 hover:bg-paper-50 focus-ring">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-navy-900 text-lime-500 text-xs font-semibold">{initials(userName)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal normal-case tracking-normal">
            <div className="text-sm font-semibold text-ink-900">{userName}</div>
            <div className="text-xs text-ink-500">{userEmail}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/admin"><UserIcon className="mr-2 h-4 w-4" />Admin</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="text-danger focus:bg-danger-50 focus:text-danger">
            <LogOut className="mr-2 h-4 w-4" />Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
