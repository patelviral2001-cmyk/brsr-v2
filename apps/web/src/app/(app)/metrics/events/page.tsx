import { redirect } from "next/navigation";

// Server-side redirect prevents the blank flash of a client useEffect bounce.
export default function MetricsEventsRedirect() {
  redirect("/metrics?tab=events");
}
