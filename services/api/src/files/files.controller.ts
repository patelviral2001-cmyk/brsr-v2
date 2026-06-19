import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { ExtractionCallbackDto, UploadFileDto } from './dto/files.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { Public } from '../common/decorators/public.decorator';
import { InternalCallbackGuard } from '../common/guards/internal-callback.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('files')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  // Rate-limit uploads aggressively: 100 / minute / client. ThrottlerGuard
  // uses the IP by default — to scope per-tenant we'd need a custom tracker;
  // documented in SECURITY_AUDIT.md as a follow-up.
  @Post('upload')
  @Throttle({ default: { limit: 100, ttl: 60_000 } })
  @UseGuards(AbacGuard)
  @RequirePermissions('file.upload')
  @Audit({ entity: 'Document', action: 'upload' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        docType: { type: 'string' },
        scopeNodeId: { type: 'string' },
        periodStart: { type: 'string', format: 'date' },
        periodEnd: { type: 'string', format: 'date' },
        tags: { type: 'string', description: 'comma-separated' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    return this.svc.upload(user.tenantId, user.id, file, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('docType') docType?: string,
    @Query('status') status?: string,
    @Query('scopeNodeId') scopeNodeId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.list(user.tenantId, {
      docType,
      status,
      scopeNodeId,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Get(':id/signed-url')
  signedUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Query('ttl') ttl?: string,
  ) {
    return this.svc.signedUrl(user.tenantId, id, ttl ? Number(ttl) : undefined).then((url) => ({ url }));
  }

  /**
   * Auth-checked file download (requires Bearer JWT). Streams the object
   * from object storage through this Node process so the customer's
   * browser never sees the internal MinIO endpoint (unreachable from
   * outside the docker network) and so we get a single audited code path.
   */
  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Res() res: Response,
  ) {
    return this.svc.streamDownload(user.tenantId, id, res);
  }

  /**
   * Public file view — accepts a short-lived HMAC token in `?access=`
   * instead of a Bearer JWT. Issued by GET /:id/signed-url. Lets browsers
   * load the original document in <iframe src> or <img src> where the
   * Authorization header cannot be set. The token binds (docId, tenantId)
   * so it cannot be replayed against a different document.
   */
  @Public()
  @Get(':id/view')
  async view(
    @Param('id', ParseCuidPipe) id: string,
    @Query('access') access: string | undefined,
    @Res() res: Response,
  ) {
    if (!access) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing access token' } });
      return;
    }
    const doc = await this.svc.findOneAcrossTenants(id);
    if (!doc) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return;
    }
    if (!this.svc.verifyFileAccessToken(access, doc.id, doc.tenantId)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } });
      return;
    }
    return this.svc.streamDownload(doc.tenantId, id, res);
  }

  @Delete(':id')
  @UseGuards(AbacGuard)
  @RequirePermissions('file.delete')
  @Audit({ entity: 'Document', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.softDelete(user.tenantId, id, user.id);
  }

  @Post(':id/reprocess')
  @UseGuards(AbacGuard)
  @RequirePermissions('file.upload')
  @Audit({ entity: 'Document', action: 'reprocess' })
  reprocess(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.reprocess(user.tenantId, id, user.id);
  }

  @Public()
  @UseGuards(InternalCallbackGuard)
  @Post('extraction-callback')
  @ApiOperation({ summary: 'Internal: AI engine posts extracted fields here (HMAC-protected)' })
  callback(@Body() dto: ExtractionCallbackDto) {
    return this.svc.handleExtractionCallback(dto);
  }
}
