"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAppStore } from "@/stores/app.store";

/**
 * Global side drawer. Other features push a `{type, id}` payload into the
 * app store and we look up which renderer to mount. Until the catalog of
 * renderers grows, we show the id + type plus a back link.
 */
export function RightDrawer() {
  const open = useAppStore((s) => s.rightDrawerOpen);
  const close = useAppStore((s) => s.closeRightDrawer);
  const content = useAppStore((s) => s.rightDrawerContent);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <SheetContent side="right" className="w-[440px] sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{content?.type ?? "Details"}</SheetTitle>
          {content?.id && (
            <SheetDescription>
              <code className="font-mono text-[10px] text-slate-500">{content.id}</code>
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="p-6 text-sm text-slate-600">
          {content ? (
            <p className="text-slate-500">
              Inline detail panels are rolling out per entity type. Use the
              main page navigation for the full record while we ship them.
            </p>
          ) : (
            <p>No selection.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
