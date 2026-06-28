"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export function BulkImportDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Upload className="h-4 w-4" />Bulk Import</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk import hierarchy</DialogTitle>
          <DialogDescription>Paste CSV or upload a file. Columns: parent_code, code, name, type, address.</DialogDescription>
        </DialogHeader>
        <textarea
          className="h-48 w-full rounded-lg border border-slate-200 p-3 font-mono text-xs"
          defaultValue={`parent_code,code,name,type,address
IPG,IPI,Imagine Powertree India Ltd.,LEGAL_ENTITY,Bengaluru
IPI,BLR-HQ,Bengaluru HQ,SITE,Embassy Tech Square`}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { toast.success("Import scheduled"); setOpen(false); }}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
