import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Sets the Postgres session variable `app.current_tenant_id` so RLS policies
 * can scope all queries to the current tenant. Runs *after* JwtAuthGuard
 * has populated `req.tenantId`, but *before* any service touches Prisma.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const tenantId: string | undefined = req.tenantId;
    const userId: string | undefined = req.user?.id;
    if (!tenantId) {
      return next.handle();
    }
    return from(this.prisma.setTenantContext(tenantId, userId)).pipe(switchMap(() => next.handle()));
  }
}
