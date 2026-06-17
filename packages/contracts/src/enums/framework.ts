export const Framework = {
  BRSR: 'BRSR',
  BRSR_CORE: 'BRSR_CORE',
  GRI: 'GRI',
  SASB: 'SASB',
  TCFD: 'TCFD',
  IFRS_S1: 'IFRS_S1',
  IFRS_S2: 'IFRS_S2',
  CSRD_ESRS: 'CSRD_ESRS',
  CDP: 'CDP',
} as const;
export type Framework = (typeof Framework)[keyof typeof Framework];
export const frameworkValues = (): readonly Framework[] =>
  Object.values(Framework) as readonly Framework[];

export const MetricCategory = {
  ENVIRONMENT: 'ENVIRONMENT',
  SOCIAL: 'SOCIAL',
  GOVERNANCE: 'GOVERNANCE',
} as const;
export type MetricCategory =
  (typeof MetricCategory)[keyof typeof MetricCategory];
export const metricCategoryValues = (): readonly MetricCategory[] =>
  Object.values(MetricCategory) as readonly MetricCategory[];

export const AggregationRule = {
  SUM: 'SUM',
  WEIGHTED_AVG: 'WEIGHTED_AVG',
  LATEST: 'LATEST',
  MIN: 'MIN',
  MAX: 'MAX',
  FIRST: 'FIRST',
  COUNT: 'COUNT',
} as const;
export type AggregationRule =
  (typeof AggregationRule)[keyof typeof AggregationRule];
export const aggregationRuleValues = (): readonly AggregationRule[] =>
  Object.values(AggregationRule) as readonly AggregationRule[];

// Scope 3 has 15 GHG Protocol categories; generated to avoid 15 hand-written constants.
const scope3CatKeys = Array.from(
  { length: 15 },
  (_, i) => `SCOPE_3_CAT_${i + 1}` as const,
);
type Scope3CatKey = (typeof scope3CatKeys)[number];

const scope3CatEntries = Object.fromEntries(
  scope3CatKeys.map((k) => [k, k]),
) as { readonly [K in Scope3CatKey]: K };

export const BoundaryTag = {
  SCOPE_1: 'SCOPE_1',
  SCOPE_2_LOCATION: 'SCOPE_2_LOCATION',
  SCOPE_2_MARKET: 'SCOPE_2_MARKET',
  ...scope3CatEntries,
  N_A: 'N_A',
} as const;
export type BoundaryTag = (typeof BoundaryTag)[keyof typeof BoundaryTag];
export const boundaryTagValues = (): readonly BoundaryTag[] =>
  Object.values(BoundaryTag) as readonly BoundaryTag[];

export const GwpBasis = {
  AR5: 'AR5',
  AR6_100Y: 'AR6_100Y',
  AR6_20Y: 'AR6_20Y',
} as const;
export type GwpBasis = (typeof GwpBasis)[keyof typeof GwpBasis];
export const gwpBasisValues = (): readonly GwpBasis[] =>
  Object.values(GwpBasis) as readonly GwpBasis[];
