import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';
import { UploadEvidenceDto } from './dto/evidence.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AbacGuard } from '../common/guards/abac.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

@ApiTags('evidence')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly svc: EvidenceService) {}

  @Post('upload')
  @UseGuards(AbacGuard)
  @RequirePermissions('evidence.upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: {
    file: { type: 'string', format: 'binary' },
    siteId: { type: 'string' }, docTypeHint: { type: 'string' },
    hintPeriodStart: { type: 'string', format: 'date' },
    hintPeriodEnd: { type: 'string', format: 'date' },
  }}})
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEvidenceDto,
  ) {
    return this.svc.upload(user.tenantId, user.id, file, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
    @Query('docType') docType?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.list(user.tenantId, {
      status, siteId, docType,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Patch(':id/site')
  @UseGuards(AbacGuard)
  @RequirePermissions('evidence.review')
  attachSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: { siteId: string },
  ) {
    return this.svc.attachSite(user.tenantId, id, body.siteId, user.id);
  }

  /** Browser-loadable view (HMAC token, no Authorization header). */
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
    const ev = await this.svc.findOneAcrossTenants(id);
    if (!ev) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
      return;
    }
    if (!this.svc.verifyAccessToken(access, ev.id, ev.tenantId)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } });
      return;
    }
    return this.svc.streamView(ev.tenantId, id, res);
  }
}
