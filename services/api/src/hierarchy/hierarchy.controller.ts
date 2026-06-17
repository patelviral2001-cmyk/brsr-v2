import {
  Body,
  Controller,
  Delete,
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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HierarchyService } from './hierarchy.service';
import {
  CreateHierarchyNodeDto,
  HierarchyNodeType,
  MoveNodeDto,
  UpdateHierarchyNodeDto,
} from './dto/hierarchy.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('hierarchy')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('hierarchy')
export class HierarchyController {
  constructor(private readonly svc: HierarchyService) {}

  @Post('nodes')
  @UseGuards(AbacGuard)
  @RequirePermissions('hierarchy.write')
  @Audit({ entity: 'HierarchyNode', action: 'create' })
  @ApiOperation({ summary: 'Create a hierarchy node (validates type rules + ltree path)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHierarchyNodeDto) {
    return this.svc.create(user.tenantId, dto, user.id);
  }

  @Get('nodes')
  @ApiOperation({ summary: 'List nodes with optional filters' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: HierarchyNodeType,
    @Query('parentId') parentId?: string,
    @Query('scopeNodeId') scopeNodeId?: string,
  ) {
    return this.svc.list(user.tenantId, { type, parentId, scopeNodeId });
  }

  @Get('tree')
  @ApiOperation({ summary: 'Return the full tree for the tenant (eager-loaded children)' })
  tree(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.tree(user.tenantId);
  }

  @Get('nodes/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.findOne(user.tenantId, id);
  }

  @Patch('nodes/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('hierarchy.write')
  @Audit({ entity: 'HierarchyNode', action: 'update' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateHierarchyNodeDto,
  ) {
    return this.svc.update(user.tenantId, id, dto, user.id);
  }

  @Post('nodes/:id/move')
  @UseGuards(AbacGuard)
  @RequirePermissions('hierarchy.write')
  @Audit({ entity: 'HierarchyNode', action: 'move' })
  @ApiOperation({ summary: 'Re-parent a node — recomputes ltreePath for the whole subtree' })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: MoveNodeDto,
  ) {
    return this.svc.move(user.tenantId, id, dto, user.id);
  }

  @Delete('nodes/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('hierarchy.delete')
  @Audit({ entity: 'HierarchyNode', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.softDelete(user.tenantId, id, user.id);
  }

  @Post('bulk-import')
  @UseGuards(AbacGuard)
  @RequirePermissions('hierarchy.write')
  @Audit({ entity: 'HierarchyNode', action: 'bulk_import' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  bulkImport(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.bulkImport(user.tenantId, file.buffer, user.id);
  }

  @Get('rollup/:nodeId')
  @ApiOperation({ summary: 'Recursively sum employee count + revenue across the subtree' })
  rollup(@CurrentUser() user: AuthenticatedUser, @Param('nodeId', ParseCuidPipe) nodeId: string) {
    return this.svc.rollup(user.tenantId, nodeId);
  }
}
