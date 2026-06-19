import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ApproveReportDto, FileReportDto } from './dto/reports.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { Public } from '../common/decorators/public.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

const REPORT_FORMATS = new Set(['pdf', 'xlsx', 'xbrl']);

@ApiTags('reports')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.list(user.tenantId, take ? Number(take) : undefined, skip ? Number(skip) : undefined);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Get(':id/pdf')
  pdf(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.signedUrl(user.tenantId, id, 'pdf');
  }

  @Get(':id/xlsx')
  xlsx(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.signedUrl(user.tenantId, id, 'xlsx');
  }

  @Get(':id/xbrl')
  xbrl(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.signedUrl(user.tenantId, id, 'xbrl');
  }

  @Post(':id/approve')
  @UseGuards(AbacGuard)
  @RequirePermissions('report.approve')
  @Audit({ entity: 'Report', action: 'approve' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: ApproveReportDto,
  ) {
    return this.svc.approve(user.tenantId, id, dto, user.id);
  }

  @Post(':id/file')
  @UseGuards(AbacGuard)
  @RequirePermissions('report.file')
  @Audit({ entity: 'Report', action: 'file' })
  file(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: FileReportDto,
  ) {
    return this.svc.file(user.tenantId, id, dto, user.id);
  }

  /**
   * Public report view — accepts a short-lived HMAC token in `?access=`
   * (issued by GET /:id/pdf|xlsx|xbrl) instead of a Bearer JWT. Lets
   * browsers load the generated BRSR file in <iframe src> or via <a
   * download> without setting an Authorization header. Token binds
   * (reportId, tenantId, format, exp) so a PDF token cannot fetch the
   * XLSX, and a token issued for one report cannot read another.
   */
  @Public()
  @Get(':id/view')
  async view(
    @Param('id', ParseCuidPipe) id: string,
    @Query('format') format: string | undefined,
    @Query('access') access: string | undefined,
    @Res() res: Response,
  ) {
    if (!format || !REPORT_FORMATS.has(format)) {
      throw new BadRequestException(`format must be one of pdf|xlsx|xbrl`);
    }
    if (!access) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing access token' } });
      return;
    }
    const fmt = format as 'pdf' | 'xlsx' | 'xbrl';
    const r = await this.svc.findOneAcrossTenants(id);
    if (!r) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      return;
    }
    if (!this.svc.verifyReportAccessToken(access, r.id, r.tenantId, fmt)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } });
      return;
    }
    return this.svc.streamView(r.tenantId, id, fmt, res);
  }
}
