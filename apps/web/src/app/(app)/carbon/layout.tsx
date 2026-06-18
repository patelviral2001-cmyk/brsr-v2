import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Carbon Accounting",
  description: "GHG Protocol-aligned Scope 1, 2 (location + market) and 3 (15 categories) carbon accounting.",
};

export default function CarbonLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
