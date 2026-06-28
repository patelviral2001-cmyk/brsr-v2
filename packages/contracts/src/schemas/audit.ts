import { z } from 'zod';
import {
  auditActionValues,
  auditEntityTypeValues,
} from '../enums/audit.js';
import {
  cuidSchema,
  iso8601Schema,
  jsonValueSchema,
} from './common.js';

const auditActionSchema = z.enum(
  auditActionValues() as unknown as [string, ...string[]],
);
const auditEntityTypeSchema = z.enum(
  auditEntityTypeValues() as unknown as [string, ...string[]],
);

const auditDiffEntrySchema = z.object({
  before: jsonValueSchema,
  after: jsonValueSchema,
});

export const AuditEventSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  actorUserId: cuidSchema.nullable(),
  entityType: auditEntityTypeSchema,
  entityId: z.string().min(1),
  action: auditActionSchema,
  diff: z.record(auditDiffEntrySchema),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: iso8601Schema,
});
export type AuditEventSchemaInput = z.infer<typeof AuditEventSchema>;
