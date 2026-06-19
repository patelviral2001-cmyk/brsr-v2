"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataErrorBannerProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function DataErrorBanner({
  title = "Some data could not be loaded",
  message = "The server returned an error for one or more sections on this page. Showing fallbacks for the rest.",
  onRetry,
}: DataErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-amber-800/80">{message}</div>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
