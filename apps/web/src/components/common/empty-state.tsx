import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          {icon}
        </div>
      ) : (
        <EmptyIllustration />
      )}
      <h3 className="mt-2 text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function EmptyIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" className="text-primary-200">
      <rect x="12" y="20" width="96" height="48" rx="6" fill="#ecfdf5" />
      <rect x="20" y="28" width="44" height="6" rx="3" fill="#a7f3d0" />
      <rect x="20" y="40" width="80" height="4" rx="2" fill="#a7f3d0" />
      <rect x="20" y="48" width="60" height="4" rx="2" fill="#a7f3d0" />
      <rect x="20" y="56" width="36" height="4" rx="2" fill="#a7f3d0" />
      <circle cx="98" cy="14" r="10" fill="#047857" />
      <path d="M93 14h10M98 9v10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
