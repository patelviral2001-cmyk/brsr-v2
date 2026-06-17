import { z } from 'zod';
import { factorSourceValues, gasValues } from '../enums/factor.js';
import { gwpBasisValues } from '../enums/framework.js';
import {
  cuidSchema,
  decimalSchema,
  iso8601Schema,
} from './common.js';

const factorSourceSchema = z.enum(
  factorSourceValues() as unknown as [string, ...string[]],
);
const gasSchema = z.enum(gasValues() as unknown as [string, ...string[]]);
const gwpBasisSchema = z.enum(
  gwpBasisValues() as unknown as [string, ...string[]],
);

export const EmissionFactorSchema = z.object({
  id: cuidSchema,
  source: factorSourceSchema,
  tenantId: cuidSchema.nullable(),
  category: z.string().min(1),
  subCategory: z.string().nullable(),
  activityType: z.string().min(1),
  region: z.string().nullable(),
  gas: gasSchema,
  value: decimalSchema,
  unit: z.string().min(1),
  gwpBasis: gwpBasisSchema.nullable(),
  citation: z.string(),
  validFrom: iso8601Schema,
  validTo: iso8601Schema.nullable(),
  createdAt: iso8601Schema,
});
export type EmissionFactorSchemaInput = z.infer<typeof EmissionFactorSchema>;

export const EmissionFactorCreateInputSchema = EmissionFactorSchema.omit({
  id: true,
  createdAt: true,
});
export type EmissionFactorCreateInputSchemaInput = z.infer<
  typeof EmissionFactorCreateInputSchema
>;
