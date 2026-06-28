import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Executive ESG dashboard for BRSR, GRI, SASB, TCFD and IFRS S2.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
