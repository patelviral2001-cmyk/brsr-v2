import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakClient } from '../common/utils/keycloak-client';
import { AuditService } from '../audit/audit.service';
import { ExchangeCodeDto } from './dto/auth.dto';
import { InviteUserDto, UpdateUserDto } from './dto/users.dto';
import { AssignRoleDto, CreateRoleDto } from './dto/roles.dto';

@Injectable()
export class IamService {
  private readonly logger = new Logger(IamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kc: KeycloakClient,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Exchanges a Keycloak authorization code for an access token, decodes
   * the access token, and ensures a local User row exists (JIT provisioning).
   */
  async exchangeCode(dto: ExchangeCodeDto, ip?: string, userAgent?: string) {
    const tokenUrl = `${this.config.get<string>('KEYCLOAK_URL')}/realms/${this.config.get<string>('KEYCLOAK_REALM')}/protocol/openid-connect/token`;
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', dto.code);
    params.set('client_id', this.config.get<string>('KEYCLOAK_CLIENT_ID') ?? 'brsr-api');
    const secret = this.config.get<string>('KEYCLOAK_CLIENT_SECRET');
    if (secret) params.set('client_secret', secret);
    if (dto.redirectUri) params.set('redirect_uri', dto.redirectUri);
    if (dto.codeVerifier) params.set('code_verifier', dto.codeVerifier);

    const res = await firstValueFrom(
      this.http.post<{ access_token: string; refresh_token: string; expires_in: number; id_token?: string }>(
        tokenUrl,
        params.toString(),
        { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
      ),
    );
    const tokens = res.data;
    const decoded = jwt.decode(tokens.access_token) as Record<string, unknown> | null;
    if (!decoded) throw new BadRequestException('Could not decode access token');

    const tenantId = decoded.tenant_id as string | undefined;
    const sub = decoded.sub as string;
    const email = (decoded.email as string) ?? (decoded.preferred_username as string) ?? '';

    if (!tenantId) {
      throw new BadRequestException('Token missing tenant_id claim — user is not assigned to a tenant');
    }

    // JIT-provision local user
    const user = await (this.prisma as any).user.upsert({
      where: { keycloakSub: sub },
      update: { email, lastLoginAt: new Date() },
      create: {
        keycloakSub: sub,
        email,
        displayName: (decoded.name as string) ?? email,
        tenantId,
        active: true,
      },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      entity: 'User',
      entityId: user.id,
      action: 'login',
      ip,
      userAgent,
    });

    return {
      tokens,
      user: { id: user.id, email: user.email, tenantId: user.tenantId },
    };
  }

  async me(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: { include: { role: true, scopeNode: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async listUsers(tenantId: string, q?: string, take = 50, skip = 0) {
    return (this.prisma as any).user.findMany({
      where: {
        tenantId,
        OR: q ? [{ email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] : undefined,
      },
      take,
      skip,
      orderBy: { createdAt: 'desc' },
    });
  }

  async inviteUser(tenantId: string, dto: InviteUserDto, actorId: string) {
    const existing = await this.kc.lookupByEmail(dto.email);
    let kcId: string;
    if (existing) {
      kcId = existing.id;
    } else {
      const kcUser = await this.kc.provisionUser({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        tenantId,
        roles: dto.roles,
      });
      kcId = kcUser.id;
    }
    if (dto.sendInvite !== false) {
      await this.kc.sendEmailVerification(kcId, this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000');
    }
    const user = await (this.prisma as any).user.upsert({
      where: { keycloakSub: kcId },
      update: {},
      create: {
        keycloakSub: kcId,
        tenantId,
        email: dto.email,
        displayName: [dto.firstName, dto.lastName].filter(Boolean).join(' ') || dto.email,
        active: true,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'User',
      entityId: user.id,
      action: 'invite',
      after: { email: dto.email },
    });
    return user;
  }

  async updateUser(tenantId: string, id: string, dto: UpdateUserDto, actorId: string) {
    const existing = await (this.prisma as any).user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');
    const updated = await (this.prisma as any).user.update({
      where: { id },
      data: {
        email: dto.email,
        displayName: dto.displayName,
        active: dto.active,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'User',
      entityId: id,
      action: 'update',
      before: existing,
      after: updated,
    });
    return updated;
  }

  async deactivateUser(tenantId: string, id: string, actorId: string) {
    const existing = await (this.prisma as any).user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');
    await (this.prisma as any).user.update({ where: { id }, data: { active: false } });
    if (existing.keycloakSub) {
      await this.kc.deactivate(existing.keycloakSub);
    }
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'User',
      entityId: id,
      action: 'deactivate',
    });
  }

  async listRoles(tenantId: string) {
    return (this.prisma as any).role.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      orderBy: [{ system: 'desc' }, { name: 'asc' }],
    });
  }

  async createRole(tenantId: string, dto: CreateRoleDto, actorId: string) {
    const role = await (this.prisma as any).role.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        system: false,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Role',
      entityId: role.id,
      action: 'create',
      after: role,
    });
    return role;
  }

  async assignRole(tenantId: string, dto: AssignRoleDto, actorId: string) {
    const assignment = await (this.prisma as any).roleAssignment.create({
      data: {
        tenantId,
        userId: dto.userId,
        roleId: dto.roleId,
        scopeNodeId: dto.scopeNodeId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'RoleAssignment',
      entityId: assignment.id,
      action: 'create',
      after: assignment,
    });
    return assignment;
  }

  async revokeAssignment(tenantId: string, id: string, actorId: string) {
    const existing = await (this.prisma as any).roleAssignment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await (this.prisma as any).roleAssignment.delete({ where: { id } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'RoleAssignment',
      entityId: id,
      action: 'delete',
      before: existing,
    });
  }
}
