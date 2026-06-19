import type { Metadata } from "next";
import "@/styles/globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "THE ESG — AI Native Sustainability Operating System",
    template: "%s · THE ESG",
  },
  description:
    "Upload evidence. Get audit-ready ESG disclosures. THE ESG converts bills, spreadsheets and forms into structured, traceable ESG data for BRSR, GRI and CDP.",
  applicationName: "THE ESG",
  authors: [{ name: "THE ESG" }],
  keywords: ["ESG", "Sustainability", "BRSR", "GRI", "CDP", "India"],
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
