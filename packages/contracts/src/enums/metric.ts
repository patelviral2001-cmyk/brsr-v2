export const MetricStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  REVIEWED: 'REVIEWED',
  APPROVED: 'APPROVED',
  LOCKED: 'LOCKED',
} as const;
export type MetricStatus = (typeof MetricStatus)[keyof typeof MetricStatus];
export const metricStatusValues = (): readonly MetricStatus[] =>
  Object.values(MetricStatus) as readonly MetricStatus[];

export const ConfidenceLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  VERIFIED: 'VERIFIED',
} as const;
export type ConfidenceLevel =
  (typeof ConfidenceLevel)[keyof typeof ConfidenceLevel];
export const confidenceLevelValues = (): readonly ConfidenceLevel[] =>
  Object.values(ConfidenceLevel) as readonly ConfidenceLevel[];

export const MetricSourceType = {
  EXTRACTION: 'EXTRACTION',
  MANUAL: 'MANUAL',
  CALCULATION: 'CALCULATION',
  API: 'API',
} as const;
export type MetricSourceType =
  (typeof MetricSourceType)[keyof typeof MetricSourceType];
export const metricSourceTypeValues = (): readonly MetricSourceType[] =>
  Object.values(MetricSourceType) as readonly MetricSourceType[];
