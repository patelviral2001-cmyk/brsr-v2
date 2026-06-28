import 'reflect-metadata';
import { initTracing } from './tracing';
initTracing();

// JSON.stringify default doesn't know how to handle BigInt — coerce to Number.
// Prisma BigInt columns (e.g. sizeBytes) would otherwise crash serialization.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Replace built-in logger with Pino
  app.useLogger(app.get(Logger));

  // Security — helmet defaults give us X-Content-Type-Options: nosniff,
  // X-Frame-Options DENY, and (when behind HTTPS) HSTS. We disable Helmet's
  // CSP because Caddy injects a unified policy at the edge for the HTML pages
  // — but we add a strict JSON-only CSP so a leaked HTML response would still
  // refuse to execute scripts. NOTE: CORS_ORIGIN MUST be an explicit list in
  // production — refuse the '*' wildcard.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // CORS
  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  if (process.env.NODE_ENV === 'production' && (corsOrigin === '' || corsOrigin === '*')) {
    // Refuse to boot in prod with a permissive CORS config.
    throw new Error(
      'CORS_ORIGIN must be an explicit comma-separated allowlist in production (wildcard rejected).',
    );
  }
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean) : true,
    credentials: true,
    exposedHeaders: ['x-request-id', 'x-trace-id'],
  });

  // Body limits for file uploads handled by Multer in routes
  app.set('trust proxy', 1);

  // Global prefix + versioning
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics-prom'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters + interceptors
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
  app.useGlobalInterceptors(new RequestIdInterceptor(), new ResponseInterceptor());

  // Swagger
  const swagger = new DocumentBuilder()
    .setTitle('BRSR AI Platform v2 — API')
    .setDescription(
      'Enterprise multi-tenant ESG / BRSR reporting API. ' +
        'All endpoints (except @Public()) require a Keycloak-issued bearer JWT.',
    )
    .setVersion('2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addServer('/')
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`BRSR API listening on :${port}`);
  logger.log(`Swagger UI -> http://localhost:${port}/api/docs`);
}

void bootstrap();
