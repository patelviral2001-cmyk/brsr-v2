"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  initialValue: string | number;
  unit?: string;
  onSubmit?: (value: string, reason: string) => void;
}

export function AiCorrectionForm({ initialValue, unit, onSubmit }: Props) {
  const [value, setValue] = useState(String(initialValue));
  const [reason, setReason] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value, reason);
        toast.success("Correction recorded");
      }}
    >
      <div>
        <Label>Corrected value</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
          {unit && <span className="text-xs text-slate-500">{unit}</span>}
        </div>
      </div>
      <div>
        <Label>Why was it wrong? (helps the model learn)</Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong column · OCR mis-read · unit conversion missed…" className="mt-1.5" />
      </div>
      <Button type="submit" size="sm">Submit correction</Button>
    </form>
  );
}
