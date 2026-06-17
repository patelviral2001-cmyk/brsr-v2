import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CarbonService } from './carbon.service';
import {
  CreateAbatementProjectDto,
  CreateCarbonCreditDto,
  CreateSbtiTargetDto,
  EmissionsQueryDto,
  Scope3RunDto,
  UpdateAbatementProjectDto,
  UpdateCarbonCreditDto,
  UpdateSbtiTargetDto,
} from './dto/carbon.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('carbon')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('carbon')
export class CarbonController {
  constructor(private readonly svc: CarbonService) {}

  @Get('emissions')
  emissions(@CurrentUser() user: AuthenticatedUser, @Query() q: EmissionsQueryDto) {
    return this.svc.emissions(user.tenantId, q);
  }

  @Post('scope3/run')
  @UseGuards(AbacGuard)
  @RequirePermissions('calc.run')
  @Audit({ entity: 'CalcRun', action: 'scope3_all' })
  scope3Run(@CurrentUser() user: AuthenticatedUser, @Body() dto: Scope3RunDto) {
    return this.svc.runAllScope3(user.tenantId, dto, user.id);
  }

  // ---- SBTi ----
  @Get('sbti')
  listSbti(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listSbti(user.tenantId);
  }

  @Post('sbti')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.target.write')
  @Audit({ entity: 'SbtiTarget', action: 'create' })
  createSbti(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSbtiTargetDto) {
    return this.svc.createSbti(user.tenantId, dto, user.id);
  }

  @Patch('sbti/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.target.write')
  @Audit({ entity: 'SbtiTarget', action: 'update' })
  updateSbti(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateSbtiTargetDto,
  ) {
    return this.svc.updateSbti(user.tenantId, id, dto, user.id);
  }

  @Delete('sbti/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.target.write')
  @Audit({ entity: 'SbtiTarget', action: 'delete' })
  deleteSbti(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.deleteSbti(user.tenantId, id, user.id);
  }

  // ---- Abatement ----
  @Get('abatement')
  abatement(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listAbatement(user.tenantId);
  }

  @Post('abatement')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.abatement.write')
  @Audit({ entity: 'AbatementProject', action: 'create' })
  createAbatement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAbatementProjectDto) {
    return this.svc.createAbatement(user.tenantId, dto, user.id);
  }

  @Patch('abatement/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.abatement.write')
  @Audit({ entity: 'AbatementProject', action: 'update' })
  updateAbatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateAbatementProjectDto,
  ) {
    return this.svc.updateAbatement(user.tenantId, id, dto, user.id);
  }

  @Delete('abatement/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.abatement.write')
  @Audit({ entity: 'AbatementProject', action: 'delete' })
  deleteAbatement(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.deleteAbatement(user.tenantId, id, user.id);
  }

  @Post('macc')
  @ApiOperation({ summary: 'Marginal Abatement Cost Curve, sorted by $/tCO2e' })
  macc(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.macc(user.tenantId);
  }

  // ---- Credits ----
  @Get('credits')
  credits(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listCredits(user.tenantId);
  }

  @Post('credits')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.credit.write')
  @Audit({ entity: 'CarbonCredit', action: 'create' })
  createCredit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCarbonCreditDto) {
    return this.svc.createCredit(user.tenantId, dto, user.id);
  }

  @Patch('credits/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.credit.write')
  @Audit({ entity: 'CarbonCredit', action: 'update' })
  updateCredit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateCarbonCreditDto,
  ) {
    return this.svc.updateCredit(user.tenantId, id, dto, user.id);
  }

  @Delete('credits/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('carbon.credit.write')
  @Audit({ entity: 'CarbonCredit', action: 'delete' })
  deleteCredit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.deleteCredit(user.tenantId, id, user.id);
  }

  // ---- Net Zero ----
  @Get('net-zero')
  netZero(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.netZero(user.tenantId);
  }
}
