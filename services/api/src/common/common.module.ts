import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpaClient } from './utils/opa-client';
import { S3Storage } from './utils/s3.client';
import { MagicLinkSigner } from './utils/magic-link';
import { EmailClient } from './utils/email.client';
import { TenantInterceptor } from './interceptors/tenant.interceptor';
import { AbacGuard } from './guards/abac.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantScopeGuard } from './guards/tenant-scope.guard';
import { InternalCallbackGuard } from './guards/internal-callback.guard';

@Global()
@Module({
  imports: [HttpModule],
  providers: [
    OpaClient,
    S3Storage,
    MagicLinkSigner,
    EmailClient,
    TenantInterceptor,
    AbacGuard,
    RolesGuard,
    TenantScopeGuard,
    InternalCallbackGuard,
  ],
  exports: [
    OpaClient,
    S3Storage,
    MagicLinkSigner,
    EmailClient,
    TenantInterceptor,
    AbacGuard,
    RolesGuard,
    TenantScopeGuard,
    InternalCallbackGuard,
    HttpModule,
  ],
})
export class CommonModule {}
