export const TenantPlan = {
  COMPLIANCE: 'COMPLIANCE',
  ENTERPRISE: 'ENTERPRISE',
  GROUP: 'GROUP',
  LISTED_PREMIUM: 'LISTED_PREMIUM',
} as const;
export type TenantPlan = (typeof TenantPlan)[keyof typeof TenantPlan];
export const tenantPlanValues = (): readonly TenantPlan[] =>
  Object.values(TenantPlan) as readonly TenantPlan[];

export const IsolationTier = {
  POOL: 'POOL',
  SILO: 'SILO',
  SINGLE: 'SINGLE',
} as const;
export type IsolationTier = (typeof IsolationTier)[keyof typeof IsolationTier];
export const isolationTierValues = (): readonly IsolationTier[] =>
  Object.values(IsolationTier) as readonly IsolationTier[];

export const DataResidency = {
  IN: 'IN',
  EU: 'EU',
  US: 'US',
  APAC: 'APAC',
} as const;
export type DataResidency = (typeof DataResidency)[keyof typeof DataResidency];
export const dataResidencyValues = (): readonly DataResidency[] =>
  Object.values(DataResidency) as readonly DataResidency[];
