import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Ensures every request has a stable correlation id. Uses inbound
 * `x-request-id` header when present (proxied trace), otherwise generates.
 * Echoes back in response header so clients can correlate failures.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    return next.handle();
  }
}
