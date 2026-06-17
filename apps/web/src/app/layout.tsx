import type { Metadata } from "next";
import "@/styles/globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "BRSR AI Platform — The ESG operating system for Indian enterprises",
    template: "%s · BRSR AI Platform",
  },
  description:
    "Enterprise-grade ESG platform for BRSR, GRI, SASB, TCFD, IFRS S2, CSRD reporting with AI extraction, multi-framework mapping and Big-4 assurance.",
  applicationName: "BRSR AI Platform",
  authors: [{ name: "BRSR AI" }],
  keywords: ["BRSR", "ESG", "Sustainability", "GRI", "SASB", "TCFD", "IFRS S2"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
