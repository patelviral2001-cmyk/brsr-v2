import { Badge } from "@/components/ui/badge";

const COLOR: Record<string, string> = {
  PDF: "text-rose-600 border-rose-200 bg-rose-50",
  XLSX: "text-emerald-700 border-emerald-200 bg-emerald-50",
  XBRL: "text-sky-700 border-sky-200 bg-sky-50",
  DOCX: "text-blue-700 border-blue-200 bg-blue-50",
  HTML: "text-violet-700 border-violet-200 bg-violet-50",
};

export function FormatIcons({ formats }: { formats: string[] }) {
  return (
    <div className="flex gap-1">
      {formats.map((f) => (
        <span key={f} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold ${COLOR[f] ?? "text-slate-600"}`}>
          {f}
        </span>
      ))}
    </div>
  );
}
