import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpaClient } from '../utils/opa-client';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Attribute-Based Access Control gate. Forwards subject (user), action
 * (declared permissions), resource (route + params) and context (tenant)
 * to Open Policy Agent.
 *
 * Decision data is cached on the request to avoid double-calling OPA when
 * multiple decorators stack.
 */
@Injectable()
export class AbacGuard implements CanActivate {
  private readonly logger = new Logger(AbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly opa: OpaClient,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];

    // If no permissions declared, skip ABAC entirely.
    if (requiredPermissions.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('No principal on request');

    const decision = await this.opa.allow({
      subject: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        scopes: user.scopes,
        tenantId: user.tenantId,
      },
      action: requiredPermissions,
      resource: {
        route: req.route?.path ?? req.path,
        method: req.method,
        params: req.params,
        body: maskSensitive(req.body),
      },
      context: {
        tenantId: req.tenantId,
        requestId: req.requestId,
        ip: req.ip,
      },
    });

    if (!decision.allow) {
      this.logger.warn(
        `OPA denied user=${user.id} permissions=${requiredPermissions.join(',')} reason=${decision.reason ?? 'unspecified'}`,
      );
      throw new ForbiddenException(decision.reason ?? 'Not authorized');
    }
    return true;
  }
}

function maskSensitive(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return body;
  const clone: Record<string, unknown> = { ...body };
  for (const k of ['password', 'secret', 'token', 'clientSecret']) {
    if (k in clone) clone[k] = '***';
  }
  return clone;
}
