/**
 * Client-side permission checks. The backend is source of truth — this is
 * for UI gating only.
 */

export type Permission =
  | "tenant:read"
  | "tenant:write"
  | "hierarchy:read"
  | "hierarchy:write"
  | "files:read"
  | "files:write"
  | "extraction:review"
  | "metrics:read"
  | "metrics:write"
  | "reports:read"
  | "reports:generate"
  | "reports:file"
  | "assurance:read"
  | "assurance:sign"
  | "settings:write"
  | "audit:read";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  GROUP_HEAD_SUSTAINABILITY: [
    "tenant:read", "tenant:write",
    "hierarchy:read", "hierarchy:write",
    "files:read", "files:write",
    "extraction:review",
    "metrics:read", "metrics:write",
    "reports:read", "reports:generate", "reports:file",
    "assurance:read",
    "settings:write",
    "audit:read",
  ],
  SUSTAINABILITY_ANALYST: [
    "tenant:read", "hierarchy:read",
    "files:read", "files:write",
    "extraction:review", "metrics:read", "metrics:write",
    "reports:read", "reports:generate",
    "audit:read",
  ],
  AUDITOR: [
    "tenant:read", "hierarchy:read",
    "files:read", "metrics:read", "reports:read",
    "assurance:read", "assurance:sign",
    "audit:read",
  ],
  VIEWER: ["tenant:read", "hierarchy:read", "files:read", "metrics:read", "reports:read"],
};

export function can(roles: string[] | undefined, perm: Permission): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(perm));
}

export function hasAnyRole(roles: string[] | undefined, ...needed: string[]): boolean {
  if (!roles?.length) return false;
  return needed.some((r) => roles.includes(r));
}
