import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExtractionService } from './extraction.service';
import { ConfirmExtractionDto, ExtractionCallbackDto } from './extraction.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AbacGuard } from '../common/guards/abac.guard';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { InternalCallbackGuard } from '../common/guards/internal-callback.guard';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

@ApiTags('extraction')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('extraction')
export class ExtractionController {
  constructor(private readonly svc: ExtractionService) {}

  // Internal: AI engine posts extraction results here (HMAC-protected).
  @Public()
  @UseGuards(InternalCallbackGuard)
  @Post('callback')
  @ApiOperation({ summary: 'Internal: AI engine extraction callback' })
  callback(@Body() dto: ExtractionCallbackDto) {
    return this.svc.handleCallback(dto);
  }

  // Hint the UI: which KPIs map to a given schema code
  @Get('suggested-kpis')
  suggestedKpis(@Query('schema') schema: string) {
    return { schemaCode: schema, kpiCodes: this.svc.suggestedKpisFor(schema) };
  }

  // Reviewer confirms — creates Data Points
  @Post(':evidenceId/confirm')
  @UseGuards(AbacGuard)
  @RequirePermissions('datapoint.confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('evidenceId', ParseCuidPipe) evidenceId: string,
    @Body() dto: ConfirmExtractionDto,
  ) {
    return this.svc.confirm(user.tenantId, evidenceId, dto, user.id);
  }

  @Post(':evidenceId/hold')
  @UseGuards(AbacGuard)
  @RequirePermissions('evidence.review')
  hold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('evidenceId', ParseCuidPipe) evidenceId: string,
    @Body() body: { reason: string },
  ) {
    return this.svc.hold(user.tenantId, evidenceId, body.reason ?? 'On hold', user.id);
  }
}
