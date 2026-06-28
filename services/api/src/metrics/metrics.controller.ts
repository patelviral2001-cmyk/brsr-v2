import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import {
  CreateMetricEventDto,
  QueryMetricsDto,
  RejectMetricDto,
  UpdateMetricEventDto,
} from './dto/metrics.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('metrics')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly svc: MetricsService) {}

  @Get('registry')
  registry(@Query('category') category?: string, @Query('framework') framework?: string) {
    return this.svc.listRegistry({ category, framework });
  }

  @Get('registry/:key')
  registryDetail(@Param('key') key: string) {
    return this.svc.getRegistry(key);
  }

  @Post('events')
  @UseGuards(AbacGuard)
  @RequirePermissions('metric.write')
  @Audit({ entity: 'MetricEvent', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMetricEventDto) {
    return this.svc.create(user.tenantId, dto, user.id);
  }

  @Get('events')
  query(@CurrentUser() user: AuthenticatedUser, @Query() dto: QueryMetricsDto) {
    return this.svc.query(user.tenantId, dto);
  }

  @Patch('events/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('metric.write')
  @Audit({ entity: 'MetricEvent', action: 'update' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateMetricEventDto,
  ) {
    return this.svc.update(user.tenantId, id, dto, user.id);
  }

  @Post('events/:id/submit')
  @UseGuards(AbacGuard)
  @RequirePermissions('metric.submit')
  @Audit({ entity: 'MetricEvent', action: 'submit' })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.submit(user.tenantId, id, user.id);
  }

  @Post('events/:id/approve')
  @UseGuards(AbacGuard)
  @RequirePermissions('metric.approve')
  @Audit({ entity: 'MetricEvent', action: 'approve' })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.approve(user.tenantId, id, user.id);
  }

  @Post('events/:id/reject')
  @UseGuards(AbacGuard)
  @RequirePermissions('metric.approve')
  @Audit({ entity: 'MetricEvent', action: 'reject' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: RejectMetricDto,
  ) {
    return this.svc.reject(user.tenantId, id, dto, user.id);
  }

  @Post('events/:id/lock')
  @UseGuards(AbacGuard)
  @RequirePermissions('metric.lock')
  @Audit({ entity: 'MetricEvent', action: 'lock' })
  lock(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.lock(user.tenantId, id, user.id);
  }

  @Post('events/bulk-import')
  @UseGuards(AbacGuard)
  @RequirePermissions('metric.write')
  @Audit({ entity: 'MetricEvent', action: 'bulk_import' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  bulkImport(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.bulkImportXlsx(user.tenantId, file.buffer, user.id);
  }
}
