import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger as NestLogger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import { trace, context as otelContext } from '@opentelemetry/api';

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
    } else if (exception instanceof Error) {
      message = exception.message;
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
