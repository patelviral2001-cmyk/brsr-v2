import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';

import { IamModule } from './iam/iam.module';
import { TenantsModule } from './tenants/tenants.module';
import { HierarchyModule } from './hierarchy/hierarchy.module';
import { MaterialityModule } from './materiality/materiality.module';
import { FilesModule } from './files/files.module';
import { DataSourcesModule } from './data-sources/data-sources.module';
import { MetricsModule } from './metrics/metrics.module';
import { ExtractionModule } from './extraction/extraction.module';
import { CalculationsModule } from './calculations/calculations.module';
import { BrsrModule } from './brsr/brsr.module';
import { ReportsModule } from './reports/reports.module';
import { AssuranceModule } from './assurance/assurance.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CarbonModule } from './carbon/carbon.module';
import { AuditModule } from './audit/audit.module';
import { CopilotModule } from './copilot/copilot.module';
import { HealthModule } from './health/health.module';
import { DashboardGraphqlModule } from './graphql/dashboard.graphql.module';
import { WorkflowModule } from './workflow/workflow.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
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
        connection: {
          url: process.env.REDIS_URL || 'redis://localhost:6379',
        },
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
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/graphql/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      path: '/api/v1/graphql',
      context: ({ req }: { req: any }) => ({ req }),
    }),

    PrismaModule,
    CommonModule,

    // Feature modules
    IamModule,
    TenantsModule,
    HierarchyModule,
    MaterialityModule,
    FilesModule,
    DataSourcesModule,
    MetricsModule,
    ExtractionModule,
    CalculationsModule,
    BrsrModule,
    ReportsModule,
    AssuranceModule,
    SuppliersModule,
    CarbonModule,
    AuditModule,
    CopilotModule,
    HealthModule,
    DashboardGraphqlModule,
    WorkflowModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
