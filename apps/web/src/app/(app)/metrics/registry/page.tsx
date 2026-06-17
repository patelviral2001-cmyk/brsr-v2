"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MetricsRegistryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/metrics"); }, [router]);
  return null;
}
