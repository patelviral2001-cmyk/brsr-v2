import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataPointsService } from './data-points.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

@ApiTags('data-points')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('data-points')
export class DataPointsController {
  constructor(private readonly svc: DataPointsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('siteId') siteId?: string,
    @Query('kpi') kpiCode?: string,
    @Query('topic') topicCode?: string,
    @Query('fy') fy?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.list(user.tenantId, {
      siteId, kpiCode, topicCode, fy, status,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Get(':id/lineage')
  lineage(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.lineage(user.tenantId, id);
  }
}
