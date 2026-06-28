import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExtractionService } from './extraction.service';
import {
  BulkApproveDto,
  ExtractionQueueQueryDto,
  RejectExtractionFieldDto,
  UpdateExtractionFieldDto,
} from './dto/extraction.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('extraction')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('extraction')
export class ExtractionController {
  constructor(private readonly svc: ExtractionService) {}

  @Get('queue')
  @ApiOperation({ summary: 'Human-in-the-loop queue (confidence < 0.85 OR NEEDS_REVIEW)' })
  queue(@CurrentUser() user: AuthenticatedUser, @Query() q: ExtractionQueueQueryDto) {
    return this.svc.queue(user.tenantId, q);
  }

  @Get('fields/:id')
  field(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.getField(user.tenantId, id);
  }

  @Patch('fields/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('extraction.review')
  @Audit({ entity: 'ExtractionField', action: 'override' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateExtractionFieldDto,
  ) {
    return this.svc.update(user.tenantId, id, dto, user.id);
  }

  @Post('fields/:id/approve')
  @UseGuards(AbacGuard)
  @RequirePermissions('extraction.review')
  @Audit({ entity: 'ExtractionField', action: 'approve' })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.approve(user.tenantId, id, user.id);
  }

  @Post('fields/:id/reject')
  @UseGuards(AbacGuard)
  @RequirePermissions('extraction.review')
  @Audit({ entity: 'ExtractionField', action: 'reject' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: RejectExtractionFieldDto,
  ) {
    return this.svc.reject(user.tenantId, id, dto, user.id);
  }

  @Post('bulk-approve')
  @UseGuards(AbacGuard)
  @RequirePermissions('extraction.review')
  @Audit({ entity: 'ExtractionField', action: 'bulk_approve' })
  bulkApprove(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkApproveDto) {
    return this.svc.bulkApprove(user.tenantId, dto, user.id);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.stats(user.tenantId);
  }
}
