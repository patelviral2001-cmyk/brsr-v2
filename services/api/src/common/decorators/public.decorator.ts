import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as publicly accessible (skips JwtAuthGuard).
 * Use sparingly — health checks, webhook callbacks, public survey/supplier
 * magic-link endpoints, etc.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
