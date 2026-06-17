import { z } from 'zod';
import { frameworkValues } from '../enums/framework.js';
import {
  supplierResponseStatusValues,
  supplierStatusValues,
} from '../enums/supplier.js';
import {
  cuidSchema,
  decimalSchema,
  emailSchema,
  iso8601Schema,
  jsonValueSchema,
} from './common.js';

const frameworkSchema = z.enum(
  frameworkValues() as unknown as [string, ...string[]],
);
const supplierStatusSchema = z.enum(
  supplierStatusValues() as unknown as [string, ...string[]],
);
const supplierResponseStatusSchema = z.enum(
  supplierResponseStatusValues() as unknown as [string, ...string[]],
);

export const SupplierSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  name: z.string().min(1),
  country: z.string().min(2),
  sector: z.string().nullable(),
  isicCode: z.string().nullable(),
  spendInr: decimalSchema,
  primaryContactEmail: emailSchema,
  primaryContactName: z.string(),
  status: supplierStatusSchema,
  addedAt: iso8601Schema,
  lastEngagedAt: iso8601Schema.nullable(),
});
export type SupplierSchemaInput = z.infer<typeof SupplierSchema>;

const supplierQuestionTypeSchema = z.enum([
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'FILE',
]);

export const SupplierQuestionSchema = z.object({
  id: z.string().min(1),
  canonicalKey: z.string().optional(),
  prompt: z.string().min(1),
  type: supplierQuestionTypeSchema,
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
});
export type SupplierQuestionSchemaInput = z.infer<
  typeof SupplierQuestionSchema
>;

export const SupplierQuestionnaireSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  framework: frameworkSchema.optional(),
  frameworkRef: z.string().optional(),
  questions: z.array(SupplierQuestionSchema),
});
export type SupplierQuestionnaireSectionSchemaInput = z.infer<
  typeof SupplierQuestionnaireSectionSchema
>;

export const SupplierQuestionnaireSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  templateName: z.string().min(1),
  sections: z.array(SupplierQuestionnaireSectionSchema),
  createdBy: cuidSchema,
  createdAt: iso8601Schema,
  version: z.number().int().nonnegative(),
});
export type SupplierQuestionnaireSchemaInput = z.infer<
  typeof SupplierQuestionnaireSchema
>;

export const SupplierResponseSchema = z.object({
  id: cuidSchema,
  supplierId: cuidSchema,
  questionnaireId: cuidSchema,
  status: supplierResponseStatusSchema,
  responses: z.record(jsonValueSchema),
  evidenceDocIds: z.array(z.string()),
  submittedAt: iso8601Schema.nullable(),
  score: z.number().nullable(),
});
export type SupplierResponseSchemaInput = z.infer<
  typeof SupplierResponseSchema
>;

export const SupplierScoreSchema = z.object({
  id: cuidSchema,
  supplierId: cuidSchema,
  fy: z.string().min(1),
  environmentScore: z.number(),
  socialScore: z.number(),
  governanceScore: z.number(),
  compositeScore: z.number(),
  peerPercentile: z.number().min(0).max(100),
  computedAt: iso8601Schema,
});
export type SupplierScoreSchemaInput = z.infer<typeof SupplierScoreSchema>;
