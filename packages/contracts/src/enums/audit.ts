export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
  EXPORT: 'EXPORT',
  LOGIN: 'LOGIN',
  IMPERSONATE: 'IMPERSONATE',
  SIGN: 'SIGN',
  EXTRACT: 'EXTRACT',
  OVERRIDE: 'OVERRIDE',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export const auditActionValues = (): readonly AuditAction[] =>
  Object.values(AuditAction) as readonly AuditAction[];

export const AuditEntityType = {
  TENANT: 'TENANT',
  USER: 'USER',
  ENTITY_NODE: 'ENTITY_NODE',
  METRIC_EVENT: 'METRIC_EVENT',
  DOCUMENT: 'DOCUMENT',
  REPORT: 'REPORT',
  APPROVAL: 'APPROVAL',
  SUPPLIER: 'SUPPLIER',
  FACTOR: 'FACTOR',
  FORMULA: 'FORMULA',
} as const;
export type AuditEntityType =
  (typeof AuditEntityType)[keyof typeof AuditEntityType];
export const auditEntityTypeValues = (): readonly AuditEntityType[] =>
  Object.values(AuditEntityType) as readonly AuditEntityType[];
