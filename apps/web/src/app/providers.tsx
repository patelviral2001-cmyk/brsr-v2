"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { Toaster } from "sonner";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app.store";
import { registerTokenProvider } from "@/lib/api/client";
import { ErrorBoundary } from "@/components/common/error-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      }),
  );

  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (t: "light" | "dark") => {
      root.classList.toggle("dark", t === "dark");
    };
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) =>
        apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    apply(theme);
  }, [theme]);

  return (
    <SessionProvider>
      <QueryClientProvider client={client}>
        <ErrorBoundary>
          <AuthTokenBridge />
          {children}
        </ErrorBoundary>
        <Toaster
          richColors
          position="top-right"
          toastOptions={{ className: "rounded-xl" }}
        />
        {process.env.NODE_ENV === "development" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </SessionProvider>
  );
}

/**
 * Bridges the NextAuth session into the axios client so every request
 * picks up the latest bearer token without prop-drilling. Also wires the
 * refresh + logout fallback: on a 401-after-refresh the client calls the
 * logout fn we register here, which signs the user out via NextAuth.
 */
function AuthTokenBridge() {
  const { data: session, update } = useSession();
  const router = useRouter();

  useEffect(() => {
    registerTokenProvider(
      () => session?.accessToken ?? null,
      async () => {
        // Ask NextAuth to refresh the JWT via the configured `jwt` callback.
        const refreshed = await update();
        return refreshed?.accessToken ?? null;
      },
      () => {
        // Hard fail — sign out and bounce to /login.
        signOut({ callbackUrl: "/login" }).catch(() => {
          router.push("/login");
        });
      },
    );
  }, [session?.accessToken, update, router]);

  // If the JWT callback raised RefreshAccessTokenError, force a re-login.
  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      signOut({ callbackUrl: "/login" }).catch(() => router.push("/login"));
    }
  }, [session?.error, router]);

  return null;
}
