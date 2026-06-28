"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SsoCallback() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.push("/dashboard"), 800);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary-700" />
      <p className="text-sm text-slate-500">Completing sign-in…</p>
    </div>
  );
}
