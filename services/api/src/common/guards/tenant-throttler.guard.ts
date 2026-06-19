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
    // True anonymous — fall back to IP (preserves login-throttling semantics).
    return req?.ip ?? req?.headers?.['x-forwarded-for'] ?? 'unknown';
  }
}
