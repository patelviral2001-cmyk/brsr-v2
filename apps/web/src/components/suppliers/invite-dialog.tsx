"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Copy } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/utils";

export function InviteSupplierDialog() {
  const [open, setOpen] = useState(false);
  const magicLink = "https://q.brsr-ai.com/i/8f3e22a91b7d4cce";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Send className="h-4 w-4" />Invite</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite supplier</DialogTitle>
          <DialogDescription>Send a magic link — no account required.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Email</Label><Input className="mt-1.5" placeholder="esg@vendor.com" /></div>
          <div>
            <Label>Magic link (preview)</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input value={magicLink} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => { copyToClipboard(magicLink); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { toast.success("Invite sent"); setOpen(false); }}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
