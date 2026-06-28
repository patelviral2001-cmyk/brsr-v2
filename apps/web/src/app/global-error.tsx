"use client";

/**
 * Top-level error boundary for the Next.js App Router. Renders whenever a
 * render or server error escapes every nested boundary. Must define its
 * own <html>/<body> tags because it replaces the root layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft">
            <h1 className="text-lg font-semibold text-slate-900">
              Something went wrong
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {error.message || "An unexpected error occurred."}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-[10px] text-slate-400">
                trace · {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              className="mt-6 inline-flex items-center rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-800"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
