import { Body, Controller, Get, Header, Headers, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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

  // Frontend Frameworks → BRSR drill-down hits this. GET-friendly so the
  // page can render without first having to gather the user's scope tree:
  // the service auto-defaults scope to all root entity nodes for the tenant.
  @Get('sections')
  @ApiOperation({ summary: 'Frontend-shaped BRSR section tree with values' })
  sections(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fy') fy?: string,
    @Query('framework') framework?: string,
  ) {
    return this.svc.sections(user.tenantId, {
      fy: fy ?? 'FY24-25',
      framework: (framework ?? 'BRSR') as any,
    });
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
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Client-supplied dedupe key' })
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateReportDto,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    return this.svc.generate(user.tenantId, { ...dto, idempotencyKey: idemKey }, user.id);
  }
}
