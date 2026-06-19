import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import { CreateSiteDto, UpdateSiteDto } from './dto/sites.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AbacGuard } from '../common/guards/abac.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

@ApiTags('sites')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('sites')
export class SitesController {
  constructor(private readonly svc: SitesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.list(user.tenantId, {
      status,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Post()
  @UseGuards(AbacGuard)
  @RequirePermissions('site.write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSiteDto) {
    return this.svc.create(user.tenantId, dto, user.id);
  }

  @Patch(':id')
  @UseGuards(AbacGuard)
  @RequirePermissions('site.write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.svc.update(user.tenantId, id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(AbacGuard)
  @RequirePermissions('site.delete')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.deactivate(user.tenantId, id, user.id);
  }
}
