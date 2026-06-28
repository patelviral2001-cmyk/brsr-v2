import type {
  ApprovalAction,
  WorkflowScope,
  WorkflowStatus,
} from '../enums/workflow.js';
import type { CuidId, Iso8601 } from './brand.js';

export interface ApprovalStep {
  order: number;
  role: string;
  slaHours: number;
  allowDelegate: boolean;
  requireComment: boolean;
}

export interface EscalationPolicy {
  afterHours: number;
  toRole: string;
}

export interface WorkflowConfig {
  steps: ApprovalStep[];
  escalationPolicy?: EscalationPolicy;
}

export interface WorkflowState {
  id: CuidId;
  tenantId: CuidId;
  workflowId: CuidId;
  entityType: WorkflowScope;
  entityId: CuidId;
  currentStep: number;
  status: WorkflowStatus;
  startedAt: Iso8601;
  completedAt: Iso8601 | null;
  slaDeadline: Iso8601;
}

export interface ApprovalActionRecord {
  id: CuidId;
  workflowInstanceId: CuidId;
  step: number;
  action: ApprovalAction;
  performedBy: CuidId;
  performedAt: Iso8601;
  comment: string | null;
  evidenceS3: string | null;
}
