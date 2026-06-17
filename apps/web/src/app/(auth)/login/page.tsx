"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  ShieldCheck,
  Award,
  FileBarChart2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_EMAIL = "demo@imaginepowertree.com";
const DEMO_PASSWORD = "Demo@1234";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search?.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState(DEMO_MODE ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(DEMO_MODE ? DEMO_PASSWORD : "");
  const [loading, setLoading] = useState(false);

  // If demo mode is on, prefill so the "Sign in" button works in one click.
  useEffect(() => {
    if (DEMO_MODE) {
      setEmail((v) => v || DEMO_EMAIL);
      setPassword((v) => v || DEMO_PASSWORD);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (!res || res.error) {
        const description =
          res?.error === "CredentialsSignin"
            ? "Email or password is incorrect."
            : res?.error ?? "Please try again.";
        toast.error("Sign-in failed", { description });
        return;
      }
      toast.success("Welcome back");
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      toast.error("Sign-in failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-primary-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 gradient-mesh opacity-40" />
        <div className="absolute inset-0 grid-pattern opacity-10" />

        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur shadow-glow-emerald">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">BRSR AI</span>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight text-balance">
            The ESG operating system for Indian enterprises.
          </h1>
          <p className="mt-5 max-w-md text-lg text-primary-100/90">
            Trusted by 40+ NSE-listed groups to file BRSR, GRI, SASB, TCFD and IFRS S2 — with 95%+ extraction accuracy and Big-4 assurance built-in.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <Pill>BRSR + BRSR Core</Pill>
            <Pill>AI Extraction 95%+</Pill>
            <Pill>Big-4 Assurance Ready</Pill>
            <Pill>Multi-framework</Pill>
            <Pill>SEBI XBRL</Pill>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-base italic text-white/90">
              "We compressed our BRSR cycle from 11 weeks to 9 days, and our auditors had every walkthrough in one click. This is the category leader."
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">PI</div>
              <div>
                <div className="text-sm font-semibold">Priya Iyer</div>
                <div className="text-xs text-primary-200">Group Head — Sustainability, Imagine Powertree</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-4 text-xs text-primary-200">
          <Stat icon={ShieldCheck} value="SOC 2 Type II" />
          <Stat icon={Award} value="ISO 27001:2022" />
          <Stat icon={FileBarChart2} value="SEBI Aligned" />
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-2 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-slate-900">BRSR AI</span>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
            {DEMO_MODE && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Demo mode
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">Sign in to your tenant.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-1.5"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="#" className="text-xs text-primary-700 hover:underline">
                  Forgot?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
              {!loading && <ArrowRight className="ml-1 h-4 w-4" />}
            </Button>
          </form>

          <Separator className="my-6" />

          <button
            onClick={fillDemo}
            type="button"
            className="w-full rounded-lg border border-dashed border-primary-300 bg-primary-50/40 p-3 text-left text-xs text-primary-900 transition-colors hover:bg-primary-50"
          >
            <div className="font-semibold">Demo credentials</div>
            <div className="mt-0.5 text-primary-800/80">
              <code className="font-mono">{DEMO_EMAIL}</code> ·{" "}
              <code className="font-mono">{DEMO_PASSWORD}</code>
            </div>
          </button>

          <p className="mt-6 text-center text-xs text-slate-400">
            By signing in, you agree to our Terms · Privacy · DPA.
          </p>
        </div>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white/90">
      {children}
    </span>
  );
}

function Stat({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <span>{value}</span>
    </div>
  );
}
