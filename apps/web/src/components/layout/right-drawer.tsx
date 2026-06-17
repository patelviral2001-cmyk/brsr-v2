"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppStore } from "@/stores/app.store";

export function RightDrawer() {
  const open = useAppStore((s) => s.rightDrawerOpen);
  const close = useAppStore((s) => s.closeRightDrawer);
  const content = useAppStore((s) => s.rightDrawerContent);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <SheetContent side="right" className="w-[440px] sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{content?.type ?? "Details"}</SheetTitle>
        </SheetHeader>
        <div className="p-6 text-sm text-slate-600">
          {content ? (
            <div>
              <div className="font-medium text-slate-900">{content.type}</div>
              <div className="text-xs text-slate-500">ID: {content.id}</div>
              <p className="mt-4 text-slate-500">Detail content goes here.</p>
            </div>
          ) : (
            <p>No selection.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
