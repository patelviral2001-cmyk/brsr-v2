"use client";

import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { useSession } from "next-auth/react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Gate the entire app shell on the NextAuth session being resolved. Without
 * this, every query under (app)/* fires before the AuthTokenBridge has had
 * a chance to forward the access token to the axios client — every request
 * gets a 401 on first paint. The middleware already redirects
 * unauthenticated users, so the only state we need to wait for here is
 * "loading".
 */
function SessionGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-slate-500">Loading workspace…</div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <SessionGate>
        <AppShell>{children}</AppShell>
      </SessionGate>
    </ErrorBoundary>
  );
}
