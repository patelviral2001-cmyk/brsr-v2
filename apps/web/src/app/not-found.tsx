import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-50 p-6">
      <div className="max-w-md rounded-2xl border border-ink-300/50 bg-paper-0 p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime-50 text-lime-700 text-2xl font-bold">404</div>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">Page not found</h1>
        <p className="mt-1 text-sm text-ink-500">Head back to your home dashboard.</p>
        <Link
          href="/home"
          className="mt-6 inline-flex items-center rounded-lg bg-lime-500 hover:bg-lime-600 px-4 py-2 text-sm font-medium text-ink-900 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
