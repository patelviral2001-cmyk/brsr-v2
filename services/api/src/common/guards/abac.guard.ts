import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpaClient } from '../utils/opa-client';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Attribute-Based Access Control gate. Forwards subject (user), action
 * (declared permissions), resource (route + params) and context (tenant)
 * to Open Policy Agent.
 *
 * RBAC fallback: when OPA is disabled (OPA_ENABLED=false) — common during
 * the early production phase before policies are authored — we MUST still
 * enforce role-based permission checks rather than waving the request
 * through. The fallback:
 *   1. Read JWT claim roles (already attached by JwtAuthGuard).
 *   2. Resolve the union of `Role.permissions` for the user's tenant-scoped
 *      role rows in Postgres. Results are cached per process for 60s.
 *   3. Deny unless EVERY required permission is in the union.
 *
 * Decision data is cached on the request to avoid double-calling OPA when
 * multiple decorators stack.
 */
@Injectable()
export class AbacGuard implements CanActivate {
  private readonly logger = new Logger(AbacGuard.name);
  // Role-permissions cache: userId -> { perms, expiresAt }
  private readonly permsCache = new Map<string, { perms: Set<string>; expiresAt: number }>();
  private readonly PERMS_CACHE_TTL_MS = 60_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly opa: OpaClient,
    private readonly prisma: PrismaService,
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

    // If OPA is enabled, defer entirely to it.
    if (this.opa.isEnabled()) {
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

    // RBAC fallback (OPA disabled). Refuse unless the user's roles cover
    // every required permission. PLATFORM_ADMIN bypasses (operations only).
    if ((user.roles as string[])?.includes('PLATFORM_ADMIN')) return true;

    const granted = await this.resolveUserPermissions(user.id, user.tenantId);
    const missing = requiredPermissions.filter((p) => !granted.has(p));
    if (missing.length === 0) return true;

    this.logger.warn(
      `RBAC denied user=${user.id} missing=${missing.join(',')} (OPA disabled — RBAC fallback)`,
    );
    throw new ForbiddenException(`Missing permissions: ${missing.join(', ')}`);
  }

  /**
   * Reads the user's role assignments (filtered to system roles or
   * tenant-owned roles) and returns the union of their `permissions` arrays.
   * Cached for PERMS_CACHE_TTL_MS to avoid hammering Postgres on every
   * authenticated request.
   */
  private async resolveUserPermissions(userId: string, tenantId: string): Promise<Set<string>> {
    const cached = this.permsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.perms;

    let perms = new Set<string>();
    try {
      const assignments: { role: { permissions: string[]; tenantId: string | null } }[] =
        await (this.prisma as any).roleAssignment.findMany({
          where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          include: { role: true },
        });
      for (const a of assignments) {
        // Only count system roles or roles owned by the user's tenant.
        if (a.role.tenantId !== null && a.role.tenantId !== tenantId) continue;
        for (const p of a.role.permissions ?? []) perms.add(p);
      }
    } catch (e) {
      this.logger.error(`RBAC fallback DB lookup failed: ${(e as Error).message}`);
      // Fail closed — no permissions if we cannot read role assignments.
      perms = new Set();
    }
    this.permsCache.set(userId, { perms, expiresAt: Date.now() + this.PERMS_CACHE_TTL_MS });
    return perms;
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
