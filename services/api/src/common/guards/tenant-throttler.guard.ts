import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Per-tenant throttling key.
 *
 * Default NestJS ThrottlerGuard keys on the client IP. In a multi-tenant
 * SaaS that means one noisy tenant behind a NAT (or sharing a load
 * balancer with us) can exhaust the bucket and starve everyone else.
 *
 * We override the tracker to prefer:
 *   1. The authenticated tenantId (set by JwtAuthGuard via req.user).
 *   2. Falling back to userId for unauthenticated routes (login).
 *   3. Falling back to remote IP only for true anonymous calls.
 *
 * Keeping the throttler module's per-window limits unchanged — this only
 * changes the key dimension.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: any): Promise<string> {
    const tenantId: string | undefined = req?.user?.tenantId ?? req?.tenantId;
    if (tenantId) return `tenant:${tenantId}`;
    const userId: string | undefined = req?.user?.id;
    if (userId) return `user:${userId}`;

    // Forensic Flow #4: behind Caddy, req.ip is always 172.18.0.1 (the
    // proxy's docker-network IP), so an IP-keyed bucket for login is
    // effectively global — one user's typo locks out the whole tenant.
    // Read the left-most entry from X-Forwarded-For (added by Caddy as the
    // real client IP) and key on that; only fall back to req.ip if XFF is
    // missing (direct connection / tests).
    const xff = req?.headers?.['x-forwarded-for'];
    const xffFirst = typeof xff === 'string'
      ? xff.split(',')[0]?.trim()
      : Array.isArray(xff)
        ? xff[0]
        : undefined;

    // Login endpoint: per-email bucket so one user's typo storm cannot
    // lock out their colleagues on the same public IP.
    const loginEmail: string | undefined = req?.body?.email;
    if (loginEmail && req?.url?.includes('/iam/auth/login')) {
      return `login:${String(loginEmail).toLowerCase()}`;
    }

    return xffFirst || req?.ip || 'unknown';
  }
}
