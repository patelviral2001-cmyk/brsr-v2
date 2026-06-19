import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { trace, context as otelContext } from '@opentelemetry/api';

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  traceId: string | null;
  requestId: string | null;
}

const RAW_PATH_PREFIXES = ['/api/v1/reports/', '/api/v1/evidence/', '/api/v1/files/upload'];

/**
 * Wraps responses in a standard envelope `{ data, meta, traceId, requestId }`.
 * Skips wrapping for binary streams, SSE, and pre-wrapped pagination objects
 * (anything that already has a `data` key and a `meta` key).
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const requestId: string | null = req.requestId ?? null;

    return next.handle().pipe(
      map((payload) => {
        // Don't envelope binary / stream / SSE responses
        const ctype = res.getHeader('content-type');
        if (typeof ctype === 'string' && /text\/event-stream|application\/(pdf|octet-stream)|spreadsheetml/i.test(ctype)) {
          return payload;
        }
        if (RAW_PATH_PREFIXES.some((p) => req.path?.startsWith(p) && req.method === 'GET' && req.path.match(/\/(pdf|xlsx|xbrl)$/))) {
          return payload;
        }

        const span = trace.getSpan(otelContext.active());
        const traceId = span?.spanContext().traceId ?? null;

        if (payload && typeof payload === 'object' && 'data' in payload && 'meta' in (payload as object)) {
          (payload as ApiEnvelope<unknown>).traceId = traceId;
          (payload as ApiEnvelope<unknown>).requestId = requestId;
          return payload;
        }

        return { data: payload, meta: {}, traceId, requestId } satisfies ApiEnvelope<unknown>;
      }),
    );
  }
}
