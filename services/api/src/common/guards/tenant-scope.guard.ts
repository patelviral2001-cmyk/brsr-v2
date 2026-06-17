import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Guards endpoints that accept a `:tenantId` URL param and enforces that it
 * matches the tenant from the JWT. Most endpoints scope on req.tenantId
 * implicitly, but admin endpoints that explicitly target another tenant must
 * pass through a dedicated cross-tenant admin role check.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const paramTenant = req.params?.tenantId;
    if (!paramTenant) return true; // nothing to check
    if (!req.user) throw new ForbiddenException('Unauthenticated');
    if (paramTenant !== req.user.tenantId) {
      const isPlatformAdmin = (req.user.roles as string[]).includes('PLATFORM_ADMIN');
      if (!isPlatformAdmin) {
        throw new ForbiddenException('Cross-tenant access denied');
      }
    }
    return true;
  }
}
