import { Body, Controller, Get, Param, Patch, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantBrandingDto, UpdateTenantSettingDto } from './dto/tenant.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('tenants')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly svc: TenantsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current tenant config' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.me(user.tenantId);
  }

  @Patch('me')
  @UseGuards(AbacGuard)
  @RequirePermissions('tenant.update')
  @Audit({ entity: 'Tenant', action: 'update_branding' })
  @ApiOperation({ summary: 'Update branding (logo, colors, footer)' })
  updateBranding(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateTenantBrandingDto) {
    return this.svc.updateBranding(user.tenantId, dto, user.id);
  }

  @Get('me/settings')
  @ApiOperation({ summary: 'List feature flags / settings' })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listSettings(user.tenantId);
  }

  @Patch('me/settings/:key')
  @UseGuards(AbacGuard)
  @RequirePermissions('tenant.settings.write')
  @Audit({ entity: 'TenantSetting', action: 'upsert' })
  upsertSetting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: UpdateTenantSettingDto,
  ) {
    return this.svc.upsertSetting(user.tenantId, key, dto, user.id);
  }
}
