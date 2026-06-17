import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Param decorator that extracts the current tenantId from the request.
 * The tenant is populated by JwtAuthGuard from the `tenant_id` JWT claim,
 * and TenantInterceptor uses it to scope Postgres RLS.
 */
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  if (!req.tenantId) {
    throw new ForbiddenException('No tenant context on request');
  }
  return req.tenantId as string;
});
