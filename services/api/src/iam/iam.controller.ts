import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IamService } from './iam.service';
import { ExchangeCodeDto } from './dto/auth.dto';
import { InviteUserDto, UpdateUserDto } from './dto/users.dto';
import { AssignRoleDto, CreateRoleDto } from './dto/roles.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('iam')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('iam')
export class IamController {
  constructor(private readonly iam: IamService) {}

  @Public()
  @Post('auth/exchange')
  @ApiOperation({ summary: 'Exchange Keycloak code for tokens (also JIT-provisions local User)' })
  exchange(@Body() dto: ExchangeCodeDto, @Req() req: Request) {
    return this.iam.exchangeCode(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Credentials login — returns JWT for the matched user' })
  login(@Body() body: { email: string; password: string }, @Req() req: Request) {
    return this.iam.loginWithCredentials(body.email, body.password, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('auth/refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() body: { refreshToken: string }) {
    return this.iam.refreshToken(body.refreshToken);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user with roles + scopes' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.iam.me(user.id);
  }

  @Get('users')
  @UseGuards(AbacGuard)
  @RequirePermissions('user.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.iam.listUsers(user.tenantId, q, take ? Number(take) : undefined, skip ? Number(skip) : undefined);
  }

  @Post('users')
  @UseGuards(AbacGuard)
  @RequirePermissions('user.invite')
  @Audit({ entity: 'User', action: 'invite' })
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteUserDto) {
    return this.iam.inviteUser(user.tenantId, dto, user.id);
  }

  @Patch('users/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('user.update')
  @Audit({ entity: 'User', action: 'update' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.iam.updateUser(user.tenantId, id, dto, user.id);
  }

  @Delete('users/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('user.deactivate')
  @Audit({ entity: 'User', action: 'deactivate' })
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.iam.deactivateUser(user.tenantId, id, user.id);
  }

  @Get('roles')
  @UseGuards(AbacGuard)
  @RequirePermissions('role.read')
  roles(@CurrentUser() user: AuthenticatedUser) {
    return this.iam.listRoles(user.tenantId);
  }

  @Post('roles')
  @UseGuards(AbacGuard)
  @RequirePermissions('role.create')
  @Audit({ entity: 'Role', action: 'create' })
  createRole(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.iam.createRole(user.tenantId, dto, user.id);
  }

  @Post('role-assignments')
  @UseGuards(AbacGuard)
  @RequirePermissions('role.assign')
  @Audit({ entity: 'RoleAssignment', action: 'create' })
  assign(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssignRoleDto) {
    return this.iam.assignRole(user.tenantId, dto, user.id);
  }

  @Delete('role-assignments/:id')
  @UseGuards(AbacGuard)
  @RequirePermissions('role.assign')
  @Audit({ entity: 'RoleAssignment', action: 'delete' })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.iam.revokeAssignment(user.tenantId, id, user.id);
  }
}
