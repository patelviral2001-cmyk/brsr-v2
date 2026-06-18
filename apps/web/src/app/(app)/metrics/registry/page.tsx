import { redirect } from "next/navigation";

// Server-side redirect prevents the blank flash of a client useEffect bounce.
export default function MetricsRegistryRedirect() {
  redirect("/metrics");
}
