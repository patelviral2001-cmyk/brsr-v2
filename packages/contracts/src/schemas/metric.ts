import { z } from 'zod';
import {
  aggregationRuleValues,
  boundaryTagValues,
  frameworkValues,
  gwpBasisValues,
  metricCategoryValues,
} from '../enums/framework.js';
import {
  confidenceLevelValues,
  metricSourceTypeValues,
  metricStatusValues,
} from '../enums/metric.js';
import { approvalActionValues } from '../enums/workflow.js';
import {
  cuidSchema,
  decimalSchema,
  iso8601Schema,
} from './common.js';

const aggregationRuleSchema = z.enum(
  aggregationRuleValues() as unknown as [string, ...string[]],
);
const boundaryTagSchema = z.enum(
  boundaryTagValues() as unknown as [string, ...string[]],
);
const frameworkSchema = z.enum(
  frameworkValues() as unknown as [string, ...string[]],
);
const gwpBasisSchema = z.enum(
  gwpBasisValues() as unknown as [string, ...string[]],
);
const metricCategorySchema = z.enum(
  metricCategoryValues() as unknown as [string, ...string[]],
);
const confidenceLevelSchema = z.enum(
  confidenceLevelValues() as unknown as [string, ...string[]],
);
const metricSourceTypeSchema = z.enum(
  metricSourceTypeValues() as unknown as [string, ...string[]],
);
const metricStatusSchema = z.enum(
  metricStatusValues() as unknown as [string, ...string[]],
);
const approvalActionSchema = z.enum(
  approvalActionValues() as unknown as [string, ...string[]],
);

const dimensionValueSchema = z.union([z.string(), z.number()]);

export const CanonicalMetricSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_.-]+$/),
  name: z.string().min(1),
  description: z.string(),
  canonicalUnit: z.string().min(1),
  allowedUnits: z.array(z.string()),
  category: metricCategorySchema,
  subcategory: z.string(),
  dimensions: z.record(z.array(z.string())),
  aggregationRule: aggregationRuleSchema,
  boundaryTag: boundaryTagSchema.nullable(),
  gwpBasis: gwpBasisSchema.nullable(),
  dataQualityTier: z.number().int().nullable(),
  version: z.number().int().nonnegative(),
  validFrom: iso8601Schema,
  validTo: iso8601Schema.nullable(),
  isActive: z.boolean(),
});
export type CanonicalMetricSchemaInput = z.infer<typeof CanonicalMetricSchema>;

export const FrameworkMappingFormulaSchema = z.object({
  expression: z.string().min(1),
  engine: z.enum(['CEL', 'JS']),
});

export const FrameworkMappingSchema = z.object({
  id: cuidSchema,
  framework: frameworkSchema,
  frameworkCode: z.string().min(1),
  frameworkSection: z.string().nullable(),
  version: z.string().min(1),
  canonicalKeys: z.array(z.string()),
  formula: FrameworkMappingFormulaSchema.nullable(),
  aggregationOverride: aggregationRuleSchema.nullable(),
  narrativeTemplate: z.string().nullable(),
  validFrom: iso8601Schema,
  validTo: iso8601Schema.nullable(),
});
export type FrameworkMappingSchemaInput = z.infer<
  typeof FrameworkMappingSchema
>;

export const MetricEventSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  scopeNodeId: cuidSchema,
  canonicalKey: z.string().min(1),
  periodStart: iso8601Schema,
  periodEnd: iso8601Schema,
  value: decimalSchema,
  unit: z.string().min(1),
  dimensions: z.record(dimensionValueSchema),
  sourceType: metricSourceTypeSchema,
  sourceExtractionId: cuidSchema.nullable(),
  sourceCalcRunId: cuidSchema.nullable(),
  status: metricStatusSchema,
  assuranceSnapshotId: cuidSchema.nullable(),
  dataQualityScore: z.number().nullable(),
  confidenceLevel: confidenceLevelSchema.nullable(),
  submittedBy: cuidSchema,
  submittedAt: iso8601Schema,
  approvedBy: cuidSchema.nullable(),
  approvedAt: iso8601Schema.nullable(),
  comment: z.string().nullable(),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema,
});
export type MetricEventSchemaInput = z.infer<typeof MetricEventSchema>;

// The wire shape an API client posts when emitting a new event.
// Excludes server-generated fields and approval state.
export const MetricEventCreateInputSchema = z.object({
  scopeNodeId: cuidSchema,
  canonicalKey: z.string().min(1),
  periodStart: iso8601Schema,
  periodEnd: iso8601Schema,
  value: decimalSchema,
  unit: z.string().min(1),
  dimensions: z.record(dimensionValueSchema).default({}),
  sourceType: metricSourceTypeSchema,
  sourceExtractionId: cuidSchema.nullish(),
  sourceCalcRunId: cuidSchema.nullish(),
  confidenceLevel: confidenceLevelSchema.nullish(),
  comment: z.string().nullish(),
});
export type MetricEventCreateInputSchemaInput = z.infer<
  typeof MetricEventCreateInputSchema
>;

export const MetricEventApprovalSchema = z.object({
  action: approvalActionSchema,
  comment: z.string().optional(),
});
export type MetricEventApprovalSchemaInput = z.infer<
  typeof MetricEventApprovalSchema
>;
