import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Global 404 page. Picked up by Next.js for any unmatched route under the
 * app router (including the `(app)` segment). Keeps users inside the shell
 * with a clear path back home.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <span className="text-2xl font-bold">404</span>
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          The link may have moved, or it never existed. Head back to your
          dashboard to continue.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-800"
          >
            Back to dashboard
          </Link>
          <Link
            href="/copilot"
            className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Ask Copilot
          </Link>
        </div>
      </div>
    </div>
  );
}
