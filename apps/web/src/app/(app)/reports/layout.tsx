import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reports",
  description: "Generated, assured and filed BRSR / GRI / SASB / TCFD reports.",
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
