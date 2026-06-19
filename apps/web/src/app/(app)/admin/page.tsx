import Link from "next/link";
import { Building2 } from "lucide-react";

export default function AdminHomePage() {
  return (
    <div className="max-w-[800px] mx-auto px-8 py-10">
      <h1 className="text-[28px] font-semibold text-ink-900 mb-8">Admin</h1>
      <ul className="rounded-2xl border border-ink-300/50 bg-paper-0 divide-y divide-ink-300/50 shadow-soft">
        <li>
          <Link href="/admin/sites" className="flex items-center justify-between px-5 py-4 hover:bg-paper-50">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-lime-700" />
              <div>
                <div className="font-medium text-ink-900">Sites</div>
                <div className="text-[12px] text-ink-500">Add or edit your operational sites.</div>
              </div>
            </div>
            <span className="text-ink-500">→</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
