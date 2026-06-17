"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { Building, Users2, KeyRound, Plug, Palette, CreditCard, Shield, User as UserIcon, ChevronRight } from "lucide-react";

const SECTIONS = [
  { href: "/settings/organization", title: "Organization", desc: "Tenant info, fiscal year, currency", icon: Building },
  { href: "/settings/users", title: "Users", desc: "Invite, deactivate, assign scopes", icon: Users2 },
  { href: "/settings/roles", title: "Roles & Permissions", desc: "Built-in and custom roles", icon: Shield },
  { href: "/settings/api-keys", title: "API Keys", desc: "Programmatic access tokens", icon: KeyRound },
  { href: "/settings/integrations", title: "Integrations", desc: "SAP, Oracle, Tally, BI tools", icon: Plug },
  { href: "/settings/branding", title: "Branding", desc: "Logo, primary color, report cover", icon: Palette },
  { href: "/settings/billing", title: "Billing", desc: "Plan, invoices, usage", icon: CreditCard },
];

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Settings" description="Configure your tenant, users and integrations" />

      <Card>
        <CardContent className="divide-y divide-slate-100 p-0">
          <Link href="/settings" className="flex items-center gap-3 p-4 hover:bg-slate-50">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><UserIcon className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900">Profile</div>
              <div className="text-xs text-slate-500">Priya Iyer · priya.iyer@imaginepowertree.com</div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href}>
              <Card className="cursor-pointer">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-700"><Icon className="h-5 w-5" /></div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-500">{s.desc}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
