import { z } from 'zod';
import { frameworkValues } from '../enums/framework.js';
import {
  assuranceStatusValues,
  reportStatusValues,
} from '../enums/report.js';
import {
  cuidSchema,
  iso8601Schema,
  jsonValueSchema,
  sha256Schema,
} from './common.js';

const frameworkSchema = z.enum(
  frameworkValues() as unknown as [string, ...string[]],
);
const reportStatusSchema = z.enum(
  reportStatusValues() as unknown as [string, ...string[]],
);
const assuranceStatusSchema = z.enum(
  assuranceStatusValues() as unknown as [string, ...string[]],
);

export const ReportSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  fy: z.string().min(1),
  framework: frameworkSchema,
  title: z.string().min(1),
  status: reportStatusSchema,
  version: z.number().int().nonnegative(),
  parentReportId: cuidSchema.nullable(),
  reportData: z.record(jsonValueSchema),
  pdfS3: z.string().nullable(),
  xlsxS3: z.string().nullable(),
  xbrlS3: z.string().nullable(),
  docxS3: z.string().nullable(),
  narrativeOverrides: z.record(z.string()),
  generatedBy: cuidSchema,
  generatedAt: iso8601Schema,
  approvedBy: cuidSchema.nullable(),
  filedWithAuthorityAt: iso8601Schema.nullable(),
  hashAnchor: sha256Schema.nullable(),
});
export type ReportSchemaInput = z.infer<typeof ReportSchema>;

export const AssuranceSnapshotSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  fy: z.string().min(1),
  framework: frameworkSchema,
  scope: z.record(jsonValueSchema),
  snapshotAt: iso8601Schema,
  auditorOrgName: z.string().min(1),
  auditorUserIds: z.array(z.string()),
  metricCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  hashAnchor: sha256Schema,
  parentSnapshotId: cuidSchema.nullable(),
  status: assuranceStatusSchema,
  reportS3: z.string().min(1),
  signedByUserId: cuidSchema.nullable(),
  signedAt: iso8601Schema.nullable(),
});
export type AssuranceSnapshotSchemaInput = z.infer<
  typeof AssuranceSnapshotSchema
>;
