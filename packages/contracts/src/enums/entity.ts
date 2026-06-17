export const EntityType = {
  GROUP: 'GROUP',
  LEGAL_ENTITY: 'LEGAL_ENTITY',
  DIVISION: 'DIVISION',
  SITE: 'SITE',
  DEPARTMENT: 'DEPARTMENT',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];
export const entityTypeValues = (): readonly EntityType[] =>
  Object.values(EntityType) as readonly EntityType[];

export const ConsolidationMethod = {
  FULL: 'FULL',
  PROPORTIONAL: 'PROPORTIONAL',
  EQUITY: 'EQUITY',
  NOT_CONSOLIDATED: 'NOT_CONSOLIDATED',
} as const;
export type ConsolidationMethod =
  (typeof ConsolidationMethod)[keyof typeof ConsolidationMethod];
export const consolidationMethodValues = (): readonly ConsolidationMethod[] =>
  Object.values(ConsolidationMethod) as readonly ConsolidationMethod[];

export const ControlType = {
  FINANCIAL: 'FINANCIAL',
  OPERATIONAL: 'OPERATIONAL',
  EQUITY: 'EQUITY',
} as const;
export type ControlType = (typeof ControlType)[keyof typeof ControlType];
export const controlTypeValues = (): readonly ControlType[] =>
  Object.values(ControlType) as readonly ControlType[];

export const OperationalBoundary = {
  FINANCIAL_CONTROL: 'FINANCIAL_CONTROL',
  OPERATIONAL_CONTROL: 'OPERATIONAL_CONTROL',
  EQUITY_SHARE: 'EQUITY_SHARE',
} as const;
export type OperationalBoundary =
  (typeof OperationalBoundary)[keyof typeof OperationalBoundary];
export const operationalBoundaryValues = (): readonly OperationalBoundary[] =>
  Object.values(OperationalBoundary) as readonly OperationalBoundary[];
