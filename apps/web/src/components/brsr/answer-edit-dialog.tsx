"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import type { BRSRQuestion } from "@/types";

export function AnswerEditDialog({ question }: { question: BRSRQuestion }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState(String(question.answer ?? ""));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{question.ref}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{question.text}</p>
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-[160px]" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { toast.success("Answer saved"); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
