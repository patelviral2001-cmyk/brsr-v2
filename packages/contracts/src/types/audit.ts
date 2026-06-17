import type { AuditAction, AuditEntityType } from '../enums/audit.js';
import type { CuidId, Iso8601 } from './brand.js';

export interface AuditEventDiffEntry {
  before: unknown;
  after: unknown;
}

export interface AuditEvent {
  id: CuidId;
  tenantId: CuidId;
  actorUserId: CuidId | null;
  entityType: AuditEntityType;
  // entityId is a stringly-typed reference because some entities (e.g. CanonicalMetric)
  // are keyed by a natural string rather than a CuidId.
  entityId: string;
  action: AuditAction;
  diff: Record<string, AuditEventDiffEntry>;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Iso8601;
}
