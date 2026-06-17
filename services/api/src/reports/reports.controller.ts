import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ApproveReportDto, FileReportDto } from './dto/reports.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.list(user.tenantId, take ? Number(take) : undefined, skip ? Number(skip) : undefined);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Get(':id/pdf')
  pdf(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.signedUrl(user.tenantId, id, 'pdf');
  }

  @Get(':id/xlsx')
  xlsx(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.signedUrl(user.tenantId, id, 'xlsx');
  }

  @Get(':id/xbrl')
  xbrl(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.signedUrl(user.tenantId, id, 'xbrl');
  }

  @Post(':id/approve')
  @UseGuards(AbacGuard)
  @RequirePermissions('report.approve')
  @Audit({ entity: 'Report', action: 'approve' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: ApproveReportDto,
  ) {
    return this.svc.approve(user.tenantId, id, dto, user.id);
  }

  @Post(':id/file')
  @UseGuards(AbacGuard)
  @RequirePermissions('report.file')
  @Audit({ entity: 'Report', action: 'file' })
  file(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: FileReportDto,
  ) {
    return this.svc.file(user.tenantId, id, dto, user.id);
  }
}
