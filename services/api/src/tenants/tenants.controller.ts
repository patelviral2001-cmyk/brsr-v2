import { Body, Controller, Get, Patch, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantBrandingDto } from './dto/tenant.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';

@ApiTags('tenants')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly svc: TenantsService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.me(user.tenantId);
  }

  @Patch('me/branding')
  updateBranding(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateTenantBrandingDto) {
    return this.svc.updateBranding(user.tenantId, dto, user.id);
  }
}
