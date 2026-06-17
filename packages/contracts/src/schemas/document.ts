import { z } from 'zod';
import {
  docStatusValues,
  docTypeValues,
  extractionStatusValues,
} from '../enums/document.js';
import {
  cuidSchema,
  decimalSchema,
  iso8601Schema,
  sha256Schema,
} from './common.js';

const docTypeSchema = z.enum(
  docTypeValues() as unknown as [string, ...string[]],
);
const docStatusSchema = z.enum(
  docStatusValues() as unknown as [string, ...string[]],
);
const extractionStatusSchema = z.enum(
  extractionStatusValues() as unknown as [string, ...string[]],
);

export const DocumentSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  scopeNodeId: cuidSchema,
  s3Bucket: z.string().min(1),
  s3Key: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: sha256Schema,
  docType: docTypeSchema,
  classifierConfidence: z.number().min(0).max(1).nullable(),
  pageCount: z.number().int().nonnegative().nullable(),
  language: z.string().nullable(),
  ocrApplied: z.boolean(),
  uploadedBy: cuidSchema,
  uploadedAt: iso8601Schema,
  status: docStatusSchema,
  tags: z.array(z.string()),
});
export type DocumentSchemaInput = z.infer<typeof DocumentSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
  page: z.number().int().nonnegative(),
});

export const ConfidenceComponentsSchema = z.object({
  modelLogprob: z.number(),
  crossValidation: z.number(),
  peerZscore: z.number(),
  schemaValidation: z.number(),
  crossSource: z.number(),
});

const dimensionValueSchema = z.union([z.string(), z.number()]);

export const ExtractionFieldSchema = z.object({
  id: cuidSchema,
  documentId: cuidSchema,
  tenantId: cuidSchema,
  canonicalKey: z.string().min(1),
  valueText: z.string().nullable(),
  valueNum: decimalSchema.nullable(),
  unitExtracted: z.string().nullable(),
  periodStart: iso8601Schema.nullable(),
  periodEnd: iso8601Schema.nullable(),
  dimensions: z.record(dimensionValueSchema),
  sourcePage: z.number().int().nonnegative().nullable(),
  sourceBbox: BoundingBoxSchema.nullable(),
  sourceRow: z.number().int().nonnegative().nullable(),
  sourceCell: z.string().nullable(),
  rawText: z.string(),
  confidenceComponents: ConfidenceComponentsSchema,
  confidenceComposite: z.number().min(0).max(1),
  status: extractionStatusSchema,
  reviewedBy: cuidSchema.nullable(),
  reviewedAt: iso8601Schema.nullable(),
  overrideReason: z.string().nullable(),
  createdAt: iso8601Schema,
});
export type ExtractionFieldSchemaInput = z.infer<typeof ExtractionFieldSchema>;

export const DocumentUploadRequestSchema = z.object({
  scopeNodeId: cuidSchema,
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: sha256Schema,
  docType: docTypeSchema.optional(),
});
export type DocumentUploadRequestSchemaInput = z.infer<
  typeof DocumentUploadRequestSchema
>;
