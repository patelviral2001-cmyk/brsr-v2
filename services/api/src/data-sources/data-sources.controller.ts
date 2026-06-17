import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataSourcesService } from './data-sources.service';
import { CreateDataSourceDto, UpdateDataSourceDto } from './dto/data-sources.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('data-sources')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('data-sources')
export class DataSourcesController {
  constructor(private readonly svc: DataSourcesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.tenantId);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Post()
  @UseGuards(AbacGuard)
  @RequirePermissions('datasource.write')
  @Audit({ entity: 'DataSource', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDataSourceDto) {
    return this.svc.create(user.tenantId, dto, user.id);
  }

  @Patch(':id')
  @UseGuards(AbacGuard)
  @RequirePermissions('datasource.write')
  @Audit({ entity: 'DataSource', action: 'update' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateDataSourceDto,
  ) {
    return this.svc.update(user.tenantId, id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(AbacGuard)
  @RequirePermissions('datasource.write')
  @Audit({ entity: 'DataSource', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.remove(user.tenantId, id, user.id);
  }

  @Post(':id/test')
  @UseGuards(AbacGuard)
  @RequirePermissions('datasource.write')
  test(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.test(user.tenantId, id);
  }

  @Post(':id/sync')
  @UseGuards(AbacGuard)
  @RequirePermissions('datasource.sync')
  @Audit({ entity: 'DataSource', action: 'sync' })
  sync(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.sync(user.tenantId, id, user.id);
  }
}
