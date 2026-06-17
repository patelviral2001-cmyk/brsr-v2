import { Controller, Get, Query, Res, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('audit')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('logs')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Query audit logs' })
  @ApiQuery({ name: 'entity', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async logs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.audit.query({
      tenantId: user.tenantId,
      entity,
      entityId,
      userId,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('logs/export')
  @RequirePermissions('audit.export')
  @ApiOperation({ summary: 'Streaming CSV/JSONL export of audit logs' })
  @ApiQuery({ name: 'format', enum: ['csv', 'jsonl'], required: false })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('format') format: 'csv' | 'jsonl' = 'csv',
  ): Promise<void> {
    res.setHeader(
      'content-type',
      format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
    );
    res.setHeader('content-disposition', `attachment; filename="audit-${user.tenantId}.${format}"`);

    if (format === 'csv') {
      res.write('id,createdAt,userId,entity,entityId,action,requestId\n');
    }

    for await (const batch of this.audit.streamAll(user.tenantId)) {
      for (const row of batch as Record<string, unknown>[]) {
        if (format === 'csv') {
          res.write(
            [
              row.id,
              (row.createdAt as Date)?.toISOString?.() ?? row.createdAt,
              row.userId ?? '',
              row.entity,
              row.entityId ?? '',
              row.action,
              row.requestId ?? '',
            ]
              .map(csvEscape)
              .join(',') + '\n',
          );
        } else {
          res.write(JSON.stringify(row) + '\n');
        }
      }
    }
    res.end();
  }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
