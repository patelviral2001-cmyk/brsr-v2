import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { SessionGate } from "@/components/layout/session-gate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <SessionGate>
        <AppShell>{children}</AppShell>
      </SessionGate>
    </ErrorBoundary>
  );
}
