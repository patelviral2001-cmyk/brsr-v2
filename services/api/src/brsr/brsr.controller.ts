import { Body, Controller, Get, Header, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BrsrService } from './brsr.service';
import { GenerateReportDto, MappingFilterDto, PreviewBrsrDto, ResolveBrsrDto } from './dto/brsr.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('brsr')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('brsr')
export class BrsrController {
  constructor(private readonly svc: BrsrService) {}

  @Get('mappings')
  mappings(@Query() filter: MappingFilterDto) {
    return this.svc.listMappings(filter);
  }

  @Post('resolve')
  @ApiOperation({ summary: 'Resolve every BRSR section to a value + source ids' })
  resolve(@CurrentUser() user: AuthenticatedUser, @Body() dto: ResolveBrsrDto) {
    return this.svc.resolve(user.tenantId, dto);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Return rendered HTML preview of the resolved report' })
  @Header('Cache-Control', 'no-store')
  preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewBrsrDto) {
    return this.svc.preview(user.tenantId, dto);
  }

  @Post('generate')
  @UseGuards(AbacGuard)
  @RequirePermissions('report.generate')
  @Audit({ entity: 'Report', action: 'generate' })
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateReportDto) {
    return this.svc.generate(user.tenantId, dto, user.id);
  }
}
