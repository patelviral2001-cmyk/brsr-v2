"use client";

import { useSession } from "next-auth/react";

/**
 * Gate the entire app shell on the NextAuth session being resolved. Without
 * this, every query under (app)/* fires before the AuthTokenBridge has had
 * a chance to forward the access token to the axios client — every request
 * gets a 401 on first paint. The middleware already redirects
 * unauthenticated users, so the only state we need to wait for here is
 * "loading".
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
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
