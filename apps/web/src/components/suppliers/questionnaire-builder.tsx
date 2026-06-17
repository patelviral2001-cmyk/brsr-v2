"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, GripVertical, X } from "lucide-react";

interface Q { id: string; text: string }

export function QuestionnaireBuilder() {
  const [qs, setQs] = useState<Q[]>([
    { id: "1", text: "Do you have a public 1.5°C-aligned net-zero target?" },
    { id: "2", text: "Share of renewable electricity in operations (%)" },
    { id: "3", text: "Recordable injury rate (per 1M hrs)" },
  ]);

  return (
    <div className="space-y-2">
      {qs.map((q, i) => (
        <div key={q.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <GripVertical className="h-4 w-4 cursor-move text-slate-400" />
          <span className="text-xs font-mono text-slate-400">{i + 1}.</span>
          <Input value={q.text} onChange={(e) => setQs((c) => c.map((x) => x.id === q.id ? { ...x, text: e.target.value } : x))} className="flex-1 border-none shadow-none focus:ring-0" />
          <button onClick={() => setQs((c) => c.filter((x) => x.id !== q.id))} className="text-slate-400 hover:text-rose-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setQs((c) => [...c, { id: String(Date.now()), text: "" }])}>
        <Plus className="h-4 w-4" />Add question
      </Button>
    </div>
  );
}
