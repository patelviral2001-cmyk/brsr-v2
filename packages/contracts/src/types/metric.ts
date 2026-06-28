import type {
  AggregationRule,
  BoundaryTag,
  Framework,
  GwpBasis,
  MetricCategory,
} from '../enums/framework.js';
import type {
  ConfidenceLevel,
  MetricSourceType,
  MetricStatus,
} from '../enums/metric.js';
import type { CuidId, Decimal, Iso8601 } from './brand.js';

export interface CanonicalMetric {
  // Canonical key is the primary key (e.g. "ghg.scope1.stationary_combustion").
  key: string;
  name: string;
  description: string;
  canonicalUnit: string;
  allowedUnits: string[];
  category: MetricCategory;
  subcategory: string;
  dimensions: Record<string, string[]>;
  aggregationRule: AggregationRule;
  boundaryTag: BoundaryTag | null;
  gwpBasis: GwpBasis | null;
  dataQualityTier: number | null;
  version: number;
  validFrom: Iso8601;
  validTo: Iso8601 | null;
  isActive: boolean;
}

export interface FrameworkMappingFormula {
  expression: string;
  engine: 'CEL' | 'JS';
}

export interface FrameworkMapping {
  id: CuidId;
  framework: Framework;
  frameworkCode: string;
  frameworkSection: string | null;
  version: string;
  canonicalKeys: string[];
  formula: FrameworkMappingFormula | null;
  aggregationOverride: AggregationRule | null;
  narrativeTemplate: string | null;
  validFrom: Iso8601;
  validTo: Iso8601 | null;
}

export interface MetricEvent {
  id: CuidId;
  tenantId: CuidId;
  scopeNodeId: CuidId;
  canonicalKey: string;
  periodStart: Iso8601;
  periodEnd: Iso8601;
  value: Decimal;
  unit: string;
  dimensions: Record<string, string | number>;
  sourceType: MetricSourceType;
  sourceExtractionId: CuidId | null;
  sourceCalcRunId: CuidId | null;
  status: MetricStatus;
  assuranceSnapshotId: CuidId | null;
  dataQualityScore: number | null;
  confidenceLevel: ConfidenceLevel | null;
  submittedBy: CuidId;
  submittedAt: Iso8601;
  approvedBy: CuidId | null;
  approvedAt: Iso8601 | null;
  comment: string | null;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}
