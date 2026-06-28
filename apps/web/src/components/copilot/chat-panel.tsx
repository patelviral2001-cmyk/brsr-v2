"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { streamCopilot } from "@/lib/copilot";
import { generateId } from "@/lib/utils";
import { MessageBubble } from "./message-bubble";
import type { CopilotMessage } from "@/types";
import { toast } from "sonner";

const STARTER = [
  { label: "Explain Scope 3 Cat 1", text: "Explain Scope 3 Category 1 and where our biggest risks are." },
  { label: "Energy spike Q1", text: "Why is energy up 18% this Q?" },
  { label: "Draft P6 narrative", text: "Draft the Principle 6 narrative for our BRSR." },
];

const MODES = ["ANALYST", "WRITER", "EXPLAINER", "BENCHMARKER"] as const;

export function ChatPanel({
  initial = [],
  conversationId,
}: {
  initial?: CopilotMessage[];
  conversationId?: string;
}) {
  const [messages, setMessages] = useState<CopilotMessage[]>(initial);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("ANALYST");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setInput("");
    const userMsg: CopilotMessage = { id: generateId("m"), role: "user", content: text, createdAt: new Date().toISOString() };
    const assistantMsg: CopilotMessage = { id: generateId("m"), role: "assistant", content: "", createdAt: new Date().toISOString(), citations: [] };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setStreaming(true);
    abortRef.current = new AbortController();

    await streamCopilot({
      prompt: text,
      mode,
      conversationId,
      signal: abortRef.current.signal,
      onEvent: (ev) => {
        if (ev.type === "token") {
          setMessages((curr) => {
            const next = [...curr];
            const last = next[next.length - 1];
            if (last && last.role === "assistant")
              next[next.length - 1] = { ...last, content: last.content + ev.data };
            return next;
          });
        } else if (ev.type === "citation") {
          const meta = ev.meta as { id: string; type: string; ref: string } | undefined;
          setMessages((curr) => {
            const next = [...curr];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && meta) {
              next[next.length - 1] = {
                ...last,
                citations: [
                  ...(last.citations ?? []),
                  { id: meta.id, type: meta.type, ref: meta.ref, label: ev.data },
                ],
              };
            }
            return next;
          });
        } else if (ev.type === "error") {
          toast.error("Copilot stream failed", { description: ev.data });
        }
      },
      onDone: () => setStreaming(false),
      onError: (err) => {
        toast.error("Couldn't reach Copilot", { description: err.message });
      },
    });
  }, [mode, conversationId]);

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Mode switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Sparkles className="h-4 w-4 text-primary-700" />
          <span className="text-sm font-semibold text-slate-900">Copilot</span>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          {MODES.map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-4 py-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-glow-emerald">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">How can I help with your ESG data?</h3>
            <p className="mt-1 text-sm text-slate-500">Grounded in your tenant's hierarchy, metrics, and frameworks.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {STARTER.map((s) => (
                <button key={s.label} onClick={() => send(s.text)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition-all hover:border-primary-300 hover:bg-primary-50">
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        {streaming && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary-500" />
            <span>Thinking…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 p-3">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask anything about your ESG data…"
            className="min-h-[72px] resize-none pr-28"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <Badge variant="ghost" size="sm">{mode}</Badge>
            {streaming ? (
              <Button size="sm" variant="outline" onClick={stop}><Square className="h-3 w-3" /> Stop</Button>
            ) : (
              <Button size="sm" onClick={() => send(input)} disabled={!input.trim()}>
                <Send className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
