import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssuranceService } from './assurance.service';
import {
  CreateExceptionDto,
  CreateSnapshotDto,
  RespondExceptionDto,
  SampleSnapshotDto,
} from './dto/assurance.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('assurance')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('assurance')
export class AssuranceController {
  constructor(private readonly svc: AssuranceService) {}

  @Post('snapshots')
  @UseGuards(AbacGuard)
  @RequirePermissions('assurance.snapshot')
  @Audit({ entity: 'AssuranceSnapshot', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSnapshotDto) {
    return this.svc.create(user.tenantId, dto, user.id);
  }

  @Get('snapshots')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.tenantId);
  }

  @Get('snapshots/:id/walkthrough/:metricKey')
  @ApiOperation({ summary: 'Full lineage trace for a metric key (assurance walkthrough)' })
  walkthrough(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Param('metricKey') metricKey: string,
  ) {
    return this.svc.walkthrough(user.tenantId, id, metricKey);
  }

  @Post('snapshots/:id/sample')
  @UseGuards(AbacGuard)
  @RequirePermissions('assurance.sample')
  sample(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: SampleSnapshotDto,
  ) {
    return this.svc.sample(user.tenantId, id, dto);
  }

  @Get('exceptions')
  exceptions(@CurrentUser() user: AuthenticatedUser, @Query('snapshotId') snapshotId?: string) {
    return this.svc.listExceptions(user.tenantId, snapshotId);
  }

  @Post('exceptions')
  @UseGuards(AbacGuard)
  @RequirePermissions('assurance.raise')
  @Audit({ entity: 'AssuranceException', action: 'raise' })
  raise(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExceptionDto) {
    return this.svc.createException(user.tenantId, dto, user.id);
  }

  @Patch('exceptions/:id/respond')
  @UseGuards(AbacGuard)
  @RequirePermissions('assurance.respond')
  @Audit({ entity: 'AssuranceException', action: 'respond' })
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: RespondExceptionDto,
  ) {
    return this.svc.respondException(user.tenantId, id, dto, user.id);
  }
}
