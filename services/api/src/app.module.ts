import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule } from '@nestjs/throttler';
import { TenantThrottlerGuard } from './common/guards/tenant-throttler.guard';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { MetricsModule as PromMetricsModule } from './common/metrics/metrics.module';

import { IamModule } from './iam/iam.module';
import { TenantsModule } from './tenants/tenants.module';
import { HealthModule } from './health/health.module';

// THE ESG — new modules (Phase 0 + Phase 1)
import { AuditTrailModule } from './audit-trail/audit-trail.module';
import { OntologyModule } from './ontology/ontology.module';
import { SitesModule } from './sites/sites.module';
import { EvidenceModule } from './evidence/evidence.module';
import { DataPointsModule } from './data-points/data-points.module';
import { ExtractionModule } from './extraction/extraction.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { MetricsInterceptor } from './common/metrics/metrics.interceptor';
import { configValidationSchema } from './config/config.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: configValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.secret'],
          remove: true,
        },
        customProps: (req: any) => ({
          tenantId: req?.tenantId,
          userId: req?.user?.id,
          requestId: req?.requestId,
        }),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 1000, age: 60 * 60 * 24 },
          removeOnFail: { count: 5000, age: 60 * 60 * 24 * 7 },
        },
      }),
    }),
    HttpModule.register({ timeout: 30_000, maxRedirects: 3 }),
    ScheduleModule.forRoot(),

    PrismaModule,
    CommonModule,
    PromMetricsModule,

    IamModule,
    TenantsModule,
    HealthModule,

    AuditTrailModule,
    OntologyModule,
    SitesModule,
    EvidenceModule,
    DataPointsModule,
    ExtractionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
