export const APP_NAME = "BRSR AI Platform";
export const APP_TAGLINE = "The ESG operating system for Indian enterprises.";
export const APP_VERSION = "2.0.0";

/**
 * Backend base URL. In production this is the full prefix including
 * `/api/v1` (e.g. `https://your-domain.com/api/v1`). In dev we keep the
 * old behavior — `NEXT_PUBLIC_API_BASE_URL` without the `/api/v1` —
 * because `endpoints.ts` paths already start with `/api/v1`.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

/**
 * DEMO_MODE = "true" → short-circuit to the in-memory mock-fallback.
 * Anything else (false / undefined) → talk to the real backend and
 * surface errors instead of silently falling back.
 *
 * Kept `USE_MOCKS` as an alias for back-compat with older modules.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const USE_MOCKS = DEMO_MODE;

export const COPILOT_SSE_URL =
  process.env.NEXT_PUBLIC_COPILOT_SSE_URL ||
  `${API_BASE_URL}/copilot/stream`;

export const FRAMEWORKS = [
  { id: "BRSR", name: "BRSR", fullName: "Business Responsibility and Sustainability Report", color: "#047857", regulator: "SEBI" },
  { id: "BRSR_CORE", name: "BRSR Core", fullName: "BRSR Core (Assurance)", color: "#059669", regulator: "SEBI" },
  { id: "GRI", name: "GRI", fullName: "Global Reporting Initiative", color: "#0284c7", regulator: "GRI" },
  { id: "SASB", name: "SASB", fullName: "Sustainability Accounting Standards Board", color: "#7c3aed", regulator: "IFRS" },
  { id: "TCFD", name: "TCFD", fullName: "Task Force on Climate-related Financial Disclosures", color: "#0891b2", regulator: "FSB" },
  { id: "IFRS_S2", name: "IFRS S2", fullName: "IFRS S2 Climate-related Disclosures", color: "#1e40af", regulator: "IFRS" },
  { id: "CSRD", name: "CSRD/ESRS", fullName: "Corporate Sustainability Reporting Directive", color: "#ca8a04", regulator: "EU" },
] as const;

export type FrameworkId = (typeof FRAMEWORKS)[number]["id"];

export const BRSR_PRINCIPLES = [
  { id: "P1", title: "Ethical & Transparent Conduct", short: "Ethics" },
  { id: "P2", title: "Sustainable & Safe Goods/Services", short: "Products" },
  { id: "P3", title: "Employee Wellbeing", short: "Employees" },
  { id: "P4", title: "Stakeholder Responsiveness", short: "Stakeholders" },
  { id: "P5", title: "Human Rights", short: "Human Rights" },
  { id: "P6", title: "Environment Protection", short: "Environment" },
  { id: "P7", title: "Responsible Public Policy", short: "Policy" },
  { id: "P8", title: "Inclusive Growth", short: "Inclusive Growth" },
  { id: "P9", title: "Consumer Value", short: "Consumers" },
];

export const SCOPE_3_CATEGORIES = [
  { id: 1, name: "Purchased Goods & Services", short: "Cat 1" },
  { id: 2, name: "Capital Goods", short: "Cat 2" },
  { id: 3, name: "Fuel & Energy Related Activities", short: "Cat 3" },
  { id: 4, name: "Upstream Transportation & Distribution", short: "Cat 4" },
  { id: 5, name: "Waste Generated in Operations", short: "Cat 5" },
  { id: 6, name: "Business Travel", short: "Cat 6" },
  { id: 7, name: "Employee Commuting", short: "Cat 7" },
  { id: 8, name: "Upstream Leased Assets", short: "Cat 8" },
  { id: 9, name: "Downstream Transportation & Distribution", short: "Cat 9" },
  { id: 10, name: "Processing of Sold Products", short: "Cat 10" },
  { id: 11, name: "Use of Sold Products", short: "Cat 11" },
  { id: 12, name: "End-of-Life Treatment of Sold Products", short: "Cat 12" },
  { id: 13, name: "Downstream Leased Assets", short: "Cat 13" },
  { id: 14, name: "Franchises", short: "Cat 14" },
  { id: 15, name: "Investments", short: "Cat 15" },
];

export const NODE_TYPES = [
  { id: "GROUP", name: "Group", color: "#047857", icon: "Building2" },
  { id: "LEGAL_ENTITY", name: "Legal Entity", color: "#0284c7", icon: "Building" },
  { id: "BUSINESS_UNIT", name: "Business Unit", color: "#7c3aed", icon: "Briefcase" },
  { id: "SITE", name: "Site", color: "#ca8a04", icon: "Factory" },
  { id: "DEPARTMENT", name: "Department", color: "#64748b", icon: "Users" },
] as const;

export const DOC_TYPES = [
  "INVOICE",
  "UTILITY_BILL",
  "FUEL_RECEIPT",
  "PAYROLL",
  "HR_REGISTER",
  "POLICY",
  "AUDIT_REPORT",
  "SUSTAINABILITY_REPORT",
  "ENERGY_AUDIT",
  "EFFLUENT_TEST",
  "EHS_INCIDENT",
  "CSR_REPORT",
  "TRAINING_LOG",
  "PR_CERT",
  "OTHER",
] as const;

export const STATUS_COLORS: Record<string, string> = {
  PROCESSING: "bg-blue-50 text-blue-700 border-blue-200",
  EXTRACTED: "bg-violet-50 text-violet-700 border-violet-200",
  NEEDS_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  PENDING: "bg-slate-50 text-slate-700 border-slate-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SUPERSEDED: "bg-slate-50 text-slate-700 border-slate-200",
  DRAFT: "bg-slate-50 text-slate-700 border-slate-200",
  SUBMITTED: "bg-blue-50 text-blue-700 border-blue-200",
  ASSURED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
