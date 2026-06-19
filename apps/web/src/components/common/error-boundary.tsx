"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Optional callback invoked once the error has been captured. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary. Wraps the (app)/* tree so a render-time
 * failure shows a friendly UI with a "Try again" button + a "Report
 * issue" mailto, rather than a blank screen. Render errors inside the
 * boundary are swallowed; the rest of the app keeps running.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return <>{this.props.fallback}</>;
      return <ErrorFallback error={this.state.error} onRetry={this.reset} />;
    }
    return <>{this.props.children}</>;
  }
}

export function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const subject = encodeURIComponent(
    `[THE ESG] Frontend error: ${error.message.slice(0, 80)}`,
  );
  const body = encodeURIComponent(
    `Error: ${error.message}\n\nStack:\n${error.stack ?? "(no stack)"}\n\nURL: ${
      typeof window !== "undefined" ? window.location.href : ""
    }\nUser agent: ${
      typeof navigator !== "undefined" ? navigator.userAgent : ""
    }`,
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          Something went wrong
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {error.message ||
            "An unexpected error occurred. Try reloading, or report it if it keeps happening."}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-800"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <a
            href={`mailto:support@theesg.in?subject=${subject}&body=${body}`}
            className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Report issue
          </a>
        </div>
      </div>
    </div>
  );
}
