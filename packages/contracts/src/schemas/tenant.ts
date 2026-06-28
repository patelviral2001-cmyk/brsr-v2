import { z } from 'zod';
import {
  dataResidencyValues,
  isolationTierValues,
  tenantPlanValues,
} from '../enums/tenant.js';
import { cuidSchema, iso8601Schema, jsonValueSchema } from './common.js';

const tenantPlanSchema = z.enum(
  tenantPlanValues() as unknown as [string, ...string[]],
);
const isolationTierSchema = z.enum(
  isolationTierValues() as unknown as [string, ...string[]],
);
const dataResidencySchema = z.enum(
  dataResidencyValues() as unknown as [string, ...string[]],
);

export const TenantSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  plan: tenantPlanSchema,
  isolationTier: isolationTierSchema,
  dataResidency: dataResidencySchema,
  brandColor: z.string().nullable(),
  logoUrl: z.string().url().nullable(),
  customDomain: z.string().nullable(),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema,
  deletedAt: iso8601Schema.nullable(),
});
export type TenantSchemaInput = z.infer<typeof TenantSchema>;

export const TenantCreateInputSchema = TenantSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type TenantCreateInputSchemaInput = z.infer<
  typeof TenantCreateInputSchema
>;

export const TenantUpdateInputSchema = TenantCreateInputSchema.partial();
export type TenantUpdateInputSchemaInput = z.infer<
  typeof TenantUpdateInputSchema
>;

export const TenantSettingSchema = z.object({
  tenantId: cuidSchema,
  key: z.string().min(1),
  value: jsonValueSchema,
  updatedAt: iso8601Schema,
});
export type TenantSettingSchemaInput = z.infer<typeof TenantSettingSchema>;
