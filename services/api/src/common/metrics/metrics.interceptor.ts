import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Records http_requests_total + http_request_duration_seconds for every HTTP
 * call. Uses the route template (e.g. `/api/v1/files/:id`) not the raw URL
 * so label cardinality stays bounded.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const start = process.hrtime.bigint();
    const route = req?.route?.path ?? 'unmatched';
    const method = req?.method ?? 'GET';

    return next.handle().pipe(
      tap({
        next: () => this.record(start, route, method, res?.statusCode ?? 200),
        error: () => this.record(start, route, method, res?.statusCode && res.statusCode >= 400 ? res.statusCode : 500),
      }),
    );
  }

  private record(start: bigint, route: string, method: string, status: number): void {
    const dur = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = { route, method, status: String(status) };
    this.metrics.httpRequestsTotal.inc(labels);
    this.metrics.httpRequestDuration.observe(labels, dur);
  }
}
