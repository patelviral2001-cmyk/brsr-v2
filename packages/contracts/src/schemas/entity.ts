import { z } from 'zod';
import {
  consolidationMethodValues,
  controlTypeValues,
  entityTypeValues,
  operationalBoundaryValues,
} from '../enums/entity.js';
import {
  cuidSchema,
  decimalSchema,
  iso8601Schema,
  jsonValueSchema,
  ltreePathSchema,
} from './common.js';

const entityTypeSchema = z.enum(
  entityTypeValues() as unknown as [string, ...string[]],
);
const consolidationMethodSchema = z.enum(
  consolidationMethodValues() as unknown as [string, ...string[]],
);
const controlTypeSchema = z.enum(
  controlTypeValues() as unknown as [string, ...string[]],
);
const operationalBoundarySchema = z.enum(
  operationalBoundaryValues() as unknown as [string, ...string[]],
);

export const EntityNodeSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  parentId: cuidSchema.nullable(),
  ltreePath: ltreePathSchema,
  type: entityTypeSchema,
  name: z.string().min(1),
  code: z.string().min(1),
  consolidationMethod: consolidationMethodSchema,
  ownershipPct: decimalSchema,
  controlType: controlTypeSchema,
  operationalBoundary: operationalBoundarySchema,
  sector: z.string().nullable(),
  isicCode: z.string().nullable(),
  country: z.string().min(2),
  state: z.string().nullable(),
  city: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  employeeCount: z.number().int().nonnegative().nullable(),
  revenue: decimalSchema.nullable(),
  currency: z.string().nullable(),
  effectiveFrom: iso8601Schema,
  effectiveTo: iso8601Schema.nullable(),
  metadata: z.record(jsonValueSchema),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema,
});
export type EntityNodeSchemaInput = z.infer<typeof EntityNodeSchema>;

export const EntityNodeCreateInputSchema = EntityNodeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EntityNodeCreateInputSchemaInput = z.infer<
  typeof EntityNodeCreateInputSchema
>;

export const EntityNodeUpdateInputSchema =
  EntityNodeCreateInputSchema.partial();
export type EntityNodeUpdateInputSchemaInput = z.infer<
  typeof EntityNodeUpdateInputSchema
>;
