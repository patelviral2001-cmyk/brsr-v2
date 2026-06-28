import { z } from 'zod';
import {
  cuidSchema,
  emailSchema,
  iso8601Schema,
} from './common.js';

export const UserSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  idpSubject: z.string().min(1),
  email: emailSchema,
  firstName: z.string(),
  lastName: z.string(),
  locale: z.string().min(2),
  timezone: z.string().min(1),
  mfaEnrolled: z.boolean(),
  lastLoginAt: iso8601Schema.nullable(),
  isActive: z.boolean(),
  createdAt: iso8601Schema,
});
export type UserSchemaInput = z.infer<typeof UserSchema>;

export const UserCreateInputSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
});
export type UserCreateInputSchemaInput = z.infer<typeof UserCreateInputSchema>;

export const UserUpdateInputSchema = UserCreateInputSchema.partial();
export type UserUpdateInputSchemaInput = z.infer<typeof UserUpdateInputSchema>;

export const RoleSchema = z.object({
  id: cuidSchema,
  tenantId: cuidSchema,
  name: z.string().min(1),
  description: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});
export type RoleSchemaInput = z.infer<typeof RoleSchema>;

export const RoleCreateInputSchema = RoleSchema.omit({ id: true });
export type RoleCreateInputSchemaInput = z.infer<typeof RoleCreateInputSchema>;

export const RoleUpdateInputSchema = RoleCreateInputSchema.partial();
export type RoleUpdateInputSchemaInput = z.infer<typeof RoleUpdateInputSchema>;

export const RoleAssignmentSchema = z.object({
  id: cuidSchema,
  userId: cuidSchema,
  roleId: cuidSchema,
  scopeNodeId: cuidSchema.nullable(),
  grantedBy: cuidSchema,
  grantedAt: iso8601Schema,
  expiresAt: iso8601Schema.nullable(),
});
export type RoleAssignmentSchemaInput = z.infer<typeof RoleAssignmentSchema>;

export const RoleAssignmentCreateInputSchema = RoleAssignmentSchema.omit({
  id: true,
  grantedAt: true,
});
export type RoleAssignmentCreateInputSchemaInput = z.infer<
  typeof RoleAssignmentCreateInputSchema
>;
