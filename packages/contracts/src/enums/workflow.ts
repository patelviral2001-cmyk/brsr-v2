export const WorkflowScope = {
  METRIC: 'METRIC',
  DOCUMENT: 'DOCUMENT',
  REPORT: 'REPORT',
  SUPPLIER: 'SUPPLIER',
} as const;
export type WorkflowScope =
  (typeof WorkflowScope)[keyof typeof WorkflowScope];
export const workflowScopeValues = (): readonly WorkflowScope[] =>
  Object.values(WorkflowScope) as readonly WorkflowScope[];

export const WorkflowStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type WorkflowStatus =
  (typeof WorkflowStatus)[keyof typeof WorkflowStatus];
export const workflowStatusValues = (): readonly WorkflowStatus[] =>
  Object.values(WorkflowStatus) as readonly WorkflowStatus[];

export const ApprovalAction = {
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  REQUEST_INFO: 'REQUEST_INFO',
  REASSIGN: 'REASSIGN',
  COMMENT: 'COMMENT',
} as const;
export type ApprovalAction =
  (typeof ApprovalAction)[keyof typeof ApprovalAction];
export const approvalActionValues = (): readonly ApprovalAction[] =>
  Object.values(ApprovalAction) as readonly ApprovalAction[];
