import { z } from 'zod';
import {
  approvalActionValues,
  workflowScopeValues,
  workflowStatusValues,
} from '../enums/workflow.js';
import { cuidSchema, iso8601Schema } from './common.js';

const approvalActionSchema = z.enum(
  approvalActionValues() as unknown as [string, ...string[]],
);
const workflowScopeSchema = z.enum(
  workflowScopeValues() as unknown as [string, ...string[]],
);
const workflowStatusSchema = z.enum(
  workflowStatusValues() as unknown as [string, ...string[]],
);

export const ApprovalStepSchema = z.object({
  order: z.number().int().nonnegative(),
  role: z.string().min(1),
  slaHours: z.number().nonnegative(),
  allowDelegate: z.boolean(),
  requireComment: z.boolean(),
});
export type ApprovalStepSchemaInput = z.infer<typeof ApprovalStepSchema>;

export const EscalationPolicySchema = z.object({
  afterHours: z.number().nonnegative(),
  toRole: z.string().min(1),
});

export const WorkflowConfigSchema = z.object({
  steps: z.array(ApprovalStepSchema).min(1),
  escalationPolicy: EscalationPolicySchema.optional(),
});
export type WorkflowConfigSchemaInput = z.infer<typeof WorkflowConfigSchema>;

export const WorkflowStateSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  workflowId: cuidSchema,
  entityType: workflowScopeSchema,
  entityId: cuidSchema,
  currentStep: z.number().int().nonnegative(),
  status: workflowStatusSchema,
  startedAt: iso8601Schema,
  completedAt: iso8601Schema.nullable(),
  slaDeadline: iso8601Schema,
});
export type WorkflowStateSchemaInput = z.infer<typeof WorkflowStateSchema>;

export const ApprovalActionRecordSchema = z.object({
  id: cuidSchema,
  workflowInstanceId: cuidSchema,
  step: z.number().int().nonnegative(),
  action: approvalActionSchema,
  performedBy: cuidSchema,
  performedAt: iso8601Schema,
  comment: z.string().nullable(),
  evidenceS3: z.string().nullable(),
});
export type ApprovalActionRecordSchemaInput = z.infer<
  typeof ApprovalActionRecordSchema
>;

export const ApprovalSubmitSchema = z.object({
  action: approvalActionSchema,
  comment: z.string().optional(),
  evidenceS3: z.string().optional(),
});
export type ApprovalSubmitSchemaInput = z.infer<typeof ApprovalSubmitSchema>;
