import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/common/error-boundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AppShell>{children}</AppShell>
    </ErrorBoundary>
  );
}
