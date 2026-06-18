import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { DashboardService } from './dashboard.service';

/**
 * Read-only KPI / activity / anomaly endpoints used by the Dashboard.
 * Built specifically for the Dashboard page's `useDashboardKpis`,
 * `useDashboardActivity`, `useDashboardAnomalies` hooks so the customer
 * sees real values rolled up from approved metric_events rather than 0/"—".
 */
@ApiTags('dashboard')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('kpis')
  kpis(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.kpis(user.tenantId);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.activity(user.tenantId);
  }

  @Get('anomalies')
  anomalies(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.anomalies(user.tenantId);
  }
}
