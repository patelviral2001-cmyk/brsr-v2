import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'requiredRoles';

/**
 * Convenience role guard hint. Use @RequireRoles('ADMIN','REVIEWER') etc.
 * Lower-precedence than ABAC — ABAC is the authoritative authorization gate.
 */
export const RequireRoles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
