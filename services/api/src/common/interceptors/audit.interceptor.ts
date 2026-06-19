import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { get as lget } from 'lodash';
import { AUDIT_KEY, AuditMetadata } from '../decorators/audit.decorator';
import { AuditTrailService } from '../../audit-trail/audit-trail.service';

/**
 * Captures successful invocations of audited handlers and writes an AuditLog
 * row. Hashing into the daily Merkle chain is intentionally NOT done per
 * request — a nightly cron in AuditTrailService handles that for throughput.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditTrailService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest();

    return next.handle().pipe(
      tap({
        next: (response) => {
          const entityId =
            (meta.entityIdPath ? lget(req.body, meta.entityIdPath) : undefined) ??
            req.params?.id ??
            (response as { id?: string })?.id ??
            null;

          // Fire-and-forget; do not delay the response on audit IO.
          void this.audit.log({
            tenantId: req.tenantId,
            userId: req.user?.id ?? null,
            entity: meta.entity,
            entityId,
            action: meta.action,
            requestId: req.requestId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            before: null,
            after: typeof response === 'object' ? (response as Record<string, unknown>) : { value: response },
          });
        },
      }),
    );
  }
}
