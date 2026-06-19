"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { Toaster } from "sonner";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { registerTokenProvider } from "@/lib/api/client";
import { ErrorBoundary } from "@/components/common/error-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 2 },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={client}>
        <ErrorBoundary>
          <AuthTokenBridge />
          {children}
        </ErrorBoundary>
        <Toaster richColors position="top-right" toastOptions={{ className: "rounded-xl" }} />
        {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </SessionProvider>
  );
}

function AuthTokenBridge() {
  const { data: session, update } = useSession();
  const router = useRouter();

  useEffect(() => {
    registerTokenProvider(
      () => session?.accessToken ?? null,
      async () => {
        const refreshed = await update();
        return refreshed?.accessToken ?? null;
      },
      () => {
        signOut({ callbackUrl: "/login" }).catch(() => router.push("/login"));
      },
    );
  }, [session?.accessToken, update, router]);

  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      signOut({ callbackUrl: "/login" }).catch(() => router.push("/login"));
    }
  }, [session?.error, router]);

  return null;
}
