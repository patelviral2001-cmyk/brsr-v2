import type { CuidId, Iso8601 } from './brand.js';

export interface User {
  id: CuidId;
  tenantId: CuidId;
  idpSubject: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  timezone: string;
  mfaEnrolled: boolean;
  lastLoginAt: Iso8601 | null;
  isActive: boolean;
  createdAt: Iso8601;
}

export interface Role {
  id: CuidId;
  tenantId: CuidId;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}

export interface RoleAssignment {
  id: CuidId;
  userId: CuidId;
  roleId: CuidId;
  // Null scopeNodeId = tenant-wide grant.
  scopeNodeId: CuidId | null;
  grantedBy: CuidId;
  grantedAt: Iso8601;
  expiresAt: Iso8601 | null;
}

export type Scope =
  | { kind: 'TENANT'; tenantId: CuidId }
  | { kind: 'NODE'; tenantId: CuidId; nodeId: CuidId; ltreePath: string };
