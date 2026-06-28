import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalculationsService } from './calculations.service';
import { CalcRunRequestDto, CreateFormulaDto, ScopeWindowDto } from './dto/calculations.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('calculations')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('calculations')
export class CalculationsController {
  constructor(private readonly svc: CalculationsService) {}

  @Get('formulas')
  formulas(@CurrentUser() user: AuthenticatedUser, @Query('framework') framework?: string) {
    return this.svc.listFormulas(user.tenantId, framework);
  }

  @Post('formulas')
  @UseGuards(AbacGuard)
  @RequirePermissions('formula.write')
  @Audit({ entity: 'Formula', action: 'create' })
  createFormula(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFormulaDto) {
    return this.svc.createFormula(user.tenantId, dto, user.id);
  }

  @Post('run')
  @UseGuards(AbacGuard)
  @RequirePermissions('calc.run')
  @Audit({ entity: 'CalcRun', action: 'queue' })
  @ApiOperation({ summary: 'Queue a calculation run' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Client-supplied dedupe key' })
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalcRunRequestDto,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    // Header takes precedence over a body field (Stripe-style); pass through
    // to the service so the BullMQ job uses jobId for de-duplication.
    const merged = { ...dto, idempotencyKey: idemKey ?? dto.idempotencyKey };
    return this.svc.startRun(user.tenantId, merged, user.id);
  }

  @Get('runs')
  runs(@CurrentUser() user: AuthenticatedUser, @Query('take') take?: string) {
    return this.svc.listRuns(user.tenantId, take ? Number(take) : undefined);
  }

  @Get('runs/:id')
  run_detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.getRun(user.tenantId, id);
  }

  @Post('scope1')
  @UseGuards(AbacGuard)
  @RequirePermissions('calc.run')
  @Audit({ entity: 'CalcRun', action: 'scope1' })
  scope1(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScopeWindowDto) {
    return this.svc.runScope1(user.tenantId, dto, user.id);
  }

  @Post('scope2')
  @UseGuards(AbacGuard)
  @RequirePermissions('calc.run')
  @Audit({ entity: 'CalcRun', action: 'scope2' })
  scope2(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScopeWindowDto) {
    return this.svc.runScope2(user.tenantId, dto, user.id);
  }

  @Post('scope3/:category')
  @UseGuards(AbacGuard)
  @RequirePermissions('calc.run')
  @Audit({ entity: 'CalcRun', action: 'scope3' })
  scope3(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
    @Body() dto: ScopeWindowDto,
  ) {
    return this.svc.runScope3Category(user.tenantId, dto, Number(category), user.id);
  }
}
