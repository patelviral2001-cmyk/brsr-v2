import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copilot",
  description: "Grounded ESG assistant — narrates BRSR, benchmarks peers, drafts disclosures.",
};

export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
