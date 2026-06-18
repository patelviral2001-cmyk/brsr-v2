import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Tenant settings — organization, users, roles, API keys, integrations, branding, billing.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
