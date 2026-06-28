import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import {
  CreateSupplierDto,
  InviteSupplierDto,
  SubmitSupplierResponseDto,
  UpdateSupplierDto,
} from './dto/suppliers.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { Public } from '../common/decorators/public.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('suppliers')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.list(user.tenantId, take ? Number(take) : undefined, skip ? Number(skip) : undefined);
  }

  @Get('scorecard')
  scorecard(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.aggregateScorecard(user.tenantId);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Post()
  @UseGuards(AbacGuard)
  @RequirePermissions('supplier.write')
  @Audit({ entity: 'Supplier', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return this.svc.create(user.tenantId, dto, user.id);
  }

  @Patch(':id')
  @UseGuards(AbacGuard)
  @RequirePermissions('supplier.write')
  @Audit({ entity: 'Supplier', action: 'update' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.svc.update(user.tenantId, id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(AbacGuard)
  @RequirePermissions('supplier.write')
  @Audit({ entity: 'Supplier', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.remove(user.tenantId, id, user.id);
  }

  @Post(':id/invite')
  @UseGuards(AbacGuard)
  @RequirePermissions('supplier.invite')
  @Audit({ entity: 'Supplier', action: 'invite' })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: InviteSupplierDto,
  ) {
    return this.svc.invite(user.tenantId, id, dto, user.id);
  }

  @Post(':id/score')
  @UseGuards(AbacGuard)
  @RequirePermissions('supplier.write')
  @Audit({ entity: 'Supplier', action: 'score' })
  score(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.score(user.tenantId, id, user.id);
  }

  // ---- Public portal ----
  @Public()
  @Get('public/:token')
  @ApiOperation({ summary: 'Public supplier portal — questionnaire load (magic token)' })
  portal(@Param('token') token: string) {
    return this.svc.loadPortal(token);
  }

  @Public()
  @Post('public/:token/responses')
  @ApiOperation({ summary: 'Public supplier portal — submit response (magic token)' })
  submit(@Param('token') token: string, @Body() dto: SubmitSupplierResponseDto) {
    return this.svc.submitResponse(token, dto);
  }
}
