"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search?.get("callbackUrl") ?? "/home";

  const [email, setEmail] = useState("priya@theesg.in");
  const [password, setPassword] = useState("Priya@1234");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        toast.error("Invalid credentials");
      } else {
        router.replace(callbackUrl);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-paper-50">
      <div className="w-full max-w-[420px] px-6">
        <div className="flex items-center gap-2 mb-8">
          <span className="grid place-items-center h-9 w-9 rounded-md bg-navy-900 text-lime-500 font-bold">◆</span>
          <div>
            <div className="font-semibold text-ink-900 leading-tight">THE ESG</div>
            <div className="text-[12px] text-ink-500">AI Native Sustainability OS</div>
          </div>
        </div>

        <h1 className="text-[24px] font-semibold text-ink-900 mb-2">Sign in</h1>
        <p className="text-[14px] text-ink-500 mb-6">Evidence in. Disclosures out.</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-lime-500 hover:bg-lime-600 text-ink-900 font-medium">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>

        <div className="mt-8 text-[12px] text-ink-500">
          Demo: <span className="font-mono">priya@theesg.in</span> / <span className="font-mono">Priya@1234</span>
        </div>
      </div>
    </div>
  );
}
