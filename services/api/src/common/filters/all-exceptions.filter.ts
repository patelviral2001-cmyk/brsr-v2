import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger as NestLogger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AxiosError } from 'axios';

/**
 * Standardised error response with Pino structured logging.
 * Maps known Prisma error codes to appropriate HTTP statuses.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly fallback = new NestLogger(AllExceptionsFilter.name);
  constructor(private readonly logger?: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') {
        message = r;
      } else if (typeof r === 'object' && r !== null) {
        const obj = r as Record<string, unknown>;
        message = (obj.message as string) ?? exception.message;
        code = (obj.error as string) ?? code;
        if ('errors' in obj) details = obj.errors;
        if ('details' in obj) details = obj.details;
      }
      code = httpStatusToCode(status);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message } = mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'PRISMA_VALIDATION';
      message = exception.message.split('\n').slice(-3).join(' ');
    } else if (isAxiosError(exception)) {
      const ax = exception as AxiosError;
      status = ax.response?.status && ax.response.status >= 400 && ax.response.status < 600
        ? ax.response.status
        : HttpStatus.BAD_GATEWAY;
      code = status >= 500 ? 'UPSTREAM_ERROR' : 'UPSTREAM_REJECTED';
      message = `Upstream call failed: ${ax.message}`;
    } else if (isTimeoutError(exception)) {
      status = HttpStatus.GATEWAY_TIMEOUT;
      code = 'UPSTREAM_TIMEOUT';
      message = (exception as Error).message || 'Operation timed out';
    } else if (isAggregateError(exception)) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'AGGREGATE_ERROR';
      const errs = ((exception as { errors?: unknown[] }).errors ?? []).slice(0, 3);
      message = `Multiple errors (${(exception as { errors?: unknown[] }).errors?.length ?? 0}): ${errs.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')}`;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // SECURITY: never leak raw stack traces or internal error messages on 5xx.
    if (status >= 500) {
      details = undefined;
      // Replace internal detail with a stable, generic message; trace id allows
      // operators to look up the real cause server-side.
      if (process.env.NODE_ENV === 'production') {
        message = 'Internal server error';
      }
    }

    const span = trace.getSpan(otelContext.active());
    const traceId = span?.spanContext().traceId ?? null;

    const errPayload = {
      error: { code, message, details },
      data: null,
      traceId,
      requestId: req?.requestId ?? null,
    };

    const logFn = (this.logger ?? this.fallback) as { error: (obj: unknown, msg?: string) => void };
    logFn.error(
      {
        err: exception,
        status,
        code,
        path: req?.path,
        method: req?.method,
        userId: req?.user?.id,
        tenantId: req?.tenantId,
        requestId: req?.requestId,
        traceId,
      },
      `HTTP ${status} ${code}: ${message}`,
    );

    res.status(status).json(errPayload);
  }
}

function httpStatusToCode(s: number): string {
  switch (s) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return s >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}

function isAxiosError(e: unknown): boolean {
  return !!(e && typeof e === 'object' && (e as { isAxiosError?: boolean }).isAxiosError === true);
}

function isTimeoutError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: string };
  return err.name === 'TimeoutError' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
}

function isAggregateError(e: unknown): boolean {
  // Node 16+ AggregateError, or any object with an array `errors` field.
  if (typeof (globalThis as { AggregateError?: unknown }).AggregateError === 'function' &&
    e instanceof (globalThis as { AggregateError: new () => Error }).AggregateError) {
    return true;
  }
  return !!(e && typeof e === 'object' && Array.isArray((e as { errors?: unknown }).errors));
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
} {
  switch (e.code) {
    case 'P2002': // unique constraint
      return { status: 409, code: 'CONFLICT', message: `Unique constraint violation on ${(e.meta?.target as string[])?.join(', ') ?? 'field'}` };
    case 'P2003': {
      // Foreign key constraint — the referenced row doesn't exist. This is
      // a client-side data error, not a conflict; 422 is the right code.
      const field = (e.meta as any)?.field_name ?? (e.meta as any)?.constraint ?? 'related record';
      return {
        status: 422,
        code: 'INVALID_REFERENCE',
        message: `Referenced ${field} does not exist or is not accessible.`,
      };
    }
    case 'P2025': // not found for update/delete
      return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
    case 'P2014':
      return { status: 409, code: 'RELATION_VIOLATION', message: 'Relation violation' };
    default:
      return { status: 500, code: `PRISMA_${e.code}`, message: e.message.split('\n')[0] };
  }
}
