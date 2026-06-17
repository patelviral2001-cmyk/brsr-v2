import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post('upload')
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
