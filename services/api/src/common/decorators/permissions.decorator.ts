import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares fine-grained permission strings required to invoke the handler.
 * Example: @RequirePermissions('metric.write', 'metric.submit')
 *
 * The {@link AbacGuard} forwards these to OPA as part of the policy input.
 */
export const RequirePermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
