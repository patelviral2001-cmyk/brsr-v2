import { redirect } from "next/navigation";

/**
 * Settings landing redirects to the Organization page — the standard
 * "first stop" for tenant settings. Using a server-side redirect avoids
 * the blank flash a client `useEffect` redirect would cause.
 */
export default function SettingsPage() {
  redirect("/settings/organization");
}
