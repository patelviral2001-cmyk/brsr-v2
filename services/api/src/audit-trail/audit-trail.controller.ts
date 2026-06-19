import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditTrailService } from './audit-trail.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';

@ApiTags('audit-trail')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('audit-trail')
export class AuditTrailController {
  constructor(private readonly svc: AuditTrailService) {}

  @Get()
  @ApiOperation({ summary: 'Query the audit trail' })
  query(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.query({
      tenantId: user.tenantId,
      entityType,
      entityId,
      action,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }
}
