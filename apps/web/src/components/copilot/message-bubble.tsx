"use client";

import { Sparkles, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CopilotMessage } from "@/types";

export function MessageBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        isUser ? "bg-slate-200 text-slate-600" : "bg-gradient-to-br from-primary-600 to-primary-800 text-white"
      )}>
        {isUser ? <UserIcon className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </div>
      <div className={cn("max-w-[80%]", isUser && "text-right")}>
        <div className={cn(
          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary-700 text-white" : "bg-slate-50 text-slate-700"
        )}>
          {message.content}
        </div>
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((c) => (
              <Badge key={c.id + c.ref} variant="primary" size="sm" className="cursor-pointer">
                <span className="text-[9px] uppercase opacity-60">{c.type}</span>
                <span className="ml-1">{c.label}</span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
