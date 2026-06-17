"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const TYPES = ["GROUP", "LEGAL_ENTITY", "BUSINESS_UNIT", "SITE", "DEPARTMENT"];

export function CreateNodeDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" />Add Node</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add hierarchy node</DialogTitle>
          <DialogDescription>Add a new entity. Inherits parent scope unless overridden.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input className="mt-1.5" placeholder="Bengaluru HQ" /></div>
          <div><Label>Code</Label><Input className="mt-1.5" placeholder="BLR-HQ" /></div>
          <div>
            <Label>Type</Label>
            <Select defaultValue="SITE">
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Address</Label><Input className="mt-1.5" placeholder="Embassy Tech Square, Bengaluru" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { toast.success("Node created"); setOpen(false); }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
