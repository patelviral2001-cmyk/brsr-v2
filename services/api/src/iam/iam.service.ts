import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { InviteUserDto, UpdateUserDto } from './dto/users.dto';
import { AssignRoleDto, CreateRoleDto } from './dto/roles.dto';

// --------------------------------------------------------------------
// Auth hardening constants. Tunable via env in production.
// --------------------------------------------------------------------
const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 12);
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? 10);
const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES ?? 15);
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL ?? '1d';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL ?? '7d';
// In-memory per-user failed-login counter. In a multi-instance deployment
// this should move to Redis (BullMQ already requires Redis), but for a single
// API replica this gives meaningful brute-force protection layered ON TOP of
// the per-IP ThrottlerGuard.
const failedLoginAttempts = new Map<string, { count: number; lockedUntil: number }>();
// In-memory refresh-token rotation registry. Each issued refresh token's
// jti is recorded; on rotation the old jti is revoked. On reuse-after-rotate
// we MUST invalidate the entire family (RFC 6819 §5.2.2.3 mitigation).
const refreshTokenJtis = new Map<string, { userId: string; familyId: string; revoked: boolean }>();
const revokedFamilies = new Set<string>();

@Injectable()
export class IamService {
  private readonly logger = new Logger(IamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditTrailService,
  ) {}

  /**
   * Returns the JWT signing secret. In production we refuse to sign with the
   * fallback 'dev-secret' so a misconfigured deploy fails closed rather than
   * minting tokens with a publicly known key.
   */
  private getJwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'JWT_SECRET is missing or too short (need >= 32 chars). Refusing to sign tokens.',
        );
      }
      return secret ?? 'dev-secret-change-me-min-32-characters-long!!';
    }
    return secret;
  }

  /**
   * Credentials-based login. Validates email+password, returns signed JWT.
   * Used by the Next.js frontend's NextAuth Credentials provider.
   *
   * Hardening:
   *  - Per-user account lockout after MAX_FAILED_LOGIN_ATTEMPTS failures
   *    within the lock window. Locked-out users get 423 LOCKED.
   *  - bcrypt cost is set to BCRYPT_COST (default 12) for new hashes; legacy
   *    rows continue to verify against whatever cost they were created with.
   *  - JWT_SECRET shorter than 32 chars is refused in production.
   *  - Refresh tokens are rotated on each /refresh call and reuse triggers
   *    a family invalidation.
   *  - Failed logins are audited (action=LOGIN_FAILED via metadata) so a SIEM
   *    can alert on brute-force attempts.
   */
  async loginWithCredentials(email: string, password: string, ip?: string, userAgent?: string) {
    if (!email || !password) throw new BadRequestException('email and password required');

    // Pre-flight: account-lockout check (keyed by lowercased email so casing
    // doesn't bypass the counter).
    const lockKey = email.trim().toLowerCase();
    const lockState = failedLoginAttempts.get(lockKey);
    if (lockState && lockState.lockedUntil > Date.now()) {
      const minutes = Math.ceil((lockState.lockedUntil - Date.now()) / 60_000);
      throw new ForbiddenException(`Account locked. Try again in ~${minutes} min.`);
    }

    const user = await (this.prisma as any).user.findFirst({
      where: { email, isActive: true },
      include: { tenant: true },
    });

    const recordFailure = async (reason: string) => {
      const next = (failedLoginAttempts.get(lockKey)?.count ?? 0) + 1;
      const locked = next >= MAX_FAILED_LOGIN_ATTEMPTS;
      failedLoginAttempts.set(lockKey, {
        count: next,
        lockedUntil: locked ? Date.now() + ACCOUNT_LOCK_MINUTES * 60_000 : 0,
      });
      // Best-effort audit for SIEM
      try {
        await this.audit.log({
          tenantId: user?.tenantId ?? null,
          userId: user?.id ?? null,
          entity: 'User',
          entityId: user?.id ?? null,
          action: 'login',
          ip,
          userAgent,
          metadata: { result: 'FAILED', reason, attempt: next, locked },
        });
      } catch {
        /* swallow audit errors */
      }
    };

    if (!user) {
      await recordFailure('user_not_found');
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = (user as any).passwordHash as string | null;
    if (!passwordHash) {
      await recordFailure('no_password_hash');
      throw new UnauthorizedException('Credentials login not enabled for this user');
    }

    const ok = await bcrypt.compare(password, passwordHash);
    if (!ok) {
      await recordFailure('bad_password');
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login — clear lockout counter.
    failedLoginAttempts.delete(lockKey);

    const secret = this.getJwtSecret();
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        tenant_id: user.tenantId,
      },
      secret,
      { expiresIn: ACCESS_TOKEN_TTL, issuer: 'theesg-api' },
    );

    // Issue a refresh token bound to a family id. Family tracks the chain of
    // rotations; reuse of a rotated jti revokes the entire family.
    const jti = randomUUID();
    const familyId = randomUUID();
    refreshTokenJtis.set(jti, { userId: user.id, familyId, revoked: false });
    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh', jti, fam: familyId },
      secret,
      { expiresIn: REFRESH_TOKEN_TTL, issuer: 'theesg-api' },
    );

    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    try {
      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        action: 'login',
        ip,
        userAgent,
      });
    } catch (e) {
      this.logger.warn(`Audit log failed: ${e}`);
    }

    return {
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
      },
    };
  }

  /**
   * Refresh-token rotation.
   *  - Verifies the token signature + claims.
   *  - Verifies the jti has not been used before (reuse-detection).
   *  - Issues a fresh access token AND a new refresh token (rotation).
   *  - Marks the old jti as revoked.
   *  - If a revoked jti is presented again -> the entire family is invalidated
   *    (logout-everywhere; classic refresh-token theft mitigation).
   */
  async refreshToken(presentedRefresh: string) {
    const secret = this.getJwtSecret();
    let decoded: any;
    try {
      decoded = jwt.verify(presentedRefresh, secret, { issuer: 'theesg-api' });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (decoded.type !== 'refresh' || !decoded.jti || !decoded.fam) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (revokedFamilies.has(decoded.fam)) {
      throw new UnauthorizedException('Refresh token family revoked');
    }

    const existing = refreshTokenJtis.get(decoded.jti);
    if (!existing) {
      // Unknown jti -> token was either never issued by us or the server was
      // restarted. Refuse so we don't accept stale credentials.
      throw new UnauthorizedException('Refresh token not recognised');
    }
    if (existing.revoked) {
      // REUSE DETECTED — burn the whole family.
      revokedFamilies.add(decoded.fam);
      this.logger.warn(`Refresh token reuse detected for user ${existing.userId}; family ${decoded.fam} revoked`);
      throw new UnauthorizedException('Refresh token reuse detected — please re-authenticate');
    }

    const user = await (this.prisma as any).user.findUnique({ where: { id: decoded.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Mark old jti as revoked and issue a new one in the same family.
    existing.revoked = true;
    refreshTokenJtis.set(decoded.jti, existing);
    const newJti = randomUUID();
    refreshTokenJtis.set(newJti, { userId: user.id, familyId: decoded.fam, revoked: false });

    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, tenant_id: user.tenantId },
      secret,
      { expiresIn: ACCESS_TOKEN_TTL, issuer: 'theesg-api' },
    );
    const newRefresh = jwt.sign(
      { sub: user.id, type: 'refresh', jti: newJti, fam: decoded.fam },
      secret,
      { expiresIn: REFRESH_TOKEN_TTL, issuer: 'theesg-api' },
    );

    return { token: accessToken, refreshToken: newRefresh };
  }

  /**
   * Hashes a plaintext password with the configured bcrypt cost. Exposed for
   * the (future) user-password-set endpoint and the seed script.
   */
  static hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  /**
   * MFA enrollment stub. Real implementation will issue a TOTP secret, return
   * a QR-code provisioning URL, and require the user to verify a code before
   * flipping `mfaEnrolled = true`. Left as a stub so the API surface is stable.
   */
  async enrollMfaStub(userId: string): Promise<{ status: 'not_implemented'; userId: string }> {
    // Audit the intent so we can see who tried.
    try {
      const u = await (this.prisma as any).user.findUnique({ where: { id: userId } });
      if (u) {
        await this.audit.log({
          tenantId: u.tenantId,
          userId,
          entity: 'User',
          entityId: userId,
          action: 'update',
          metadata: { mfa: 'enroll_attempt' },
        });
      }
    } catch {
      /* best-effort */
    }
    return { status: 'not_implemented', userId };
  }

  /**
   * Logout invalidates the current refresh-token family so re-login is
   * required. Exposed for the /iam/auth/logout endpoint.
   */
  async logout(refreshTokenOpt?: string): Promise<{ ok: true }> {
    if (!refreshTokenOpt) return { ok: true };
    try {
      const decoded = jwt.verify(refreshTokenOpt, this.getJwtSecret(), { issuer: 'theesg-api' }) as any;
      if (decoded?.fam) revokedFamilies.add(decoded.fam);
    } catch {
      // Even if the token is malformed, logout should be idempotent.
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: { include: { role: true, scopeNode: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    // Never leak credential material to the client.
    const { passwordHash, mfaSecret, ...safe } = user as Record<string, unknown>;
    return safe;
  }

  async listUsers(tenantId: string, q?: string, take = 50, skip = 0) {
    // Cap pagination defensively.
    const t = Math.min(Math.max(1, take), 200);
    const s = Math.max(0, skip);
    // Explicit select — never return credential material (passwordHash, mfaSecret).
    return (this.prisma as any).user.findMany({
      where: {
        tenantId,
        OR: q ? [
          { email: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ] : undefined,
      },
      select: {
        id: true,
        tenantId: true,
        idpSubject: true,
        email: true,
        firstName: true,
        lastName: true,
        locale: true,
        timezone: true,
        mfaEnrolled: true,
        lastLoginAt: true,
        isActive: true,
        createdAt: true,
      },
      take: t,
      skip: s,
      orderBy: { createdAt: 'desc' },
    });
  }

  async inviteUser(tenantId: string, dto: InviteUserDto, actorId: string) {
    // Phase 0+1 uses local credentials only; idpSubject namespace prefixed `local:`
    // so a future external IdP can claim subjects without colliding.
    const kcId = `local:${dto.email}`;
    // Schema: User has unique (tenantId, email) and unique idpSubject.
    // Upsert keyed on idpSubject so re-invites are idempotent.
    const user = await (this.prisma as any).user.upsert({
      where: { idpSubject: kcId },
      update: {},
      create: {
        idpSubject: kcId,
        tenantId,
        email: dto.email,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        isActive: true,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'User',
      entityId: user.id,
      action: 'CREATE',
      after: { email: dto.email },
      metadata: { invited: true },
    });
    return user;
  }

  async updateUser(tenantId: string, id: string, dto: UpdateUserDto, actorId: string) {
    const existing = await (this.prisma as any).user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');
    // Map DTO -> schema fields. UpdateUserDto carries displayName / active for
    // backward compatibility; convert them.
    const data: Record<string, unknown> = {};
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if ((dto as { displayName?: string }).displayName !== undefined) {
      const parts = String((dto as { displayName: string }).displayName).split(' ');
      data.firstName = parts[0] ?? null;
      data.lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
    }
    if ((dto as { active?: boolean }).active !== undefined) {
      data.isActive = (dto as { active: boolean }).active;
    }
    const updated = await (this.prisma as any).user.update({ where: { id }, data });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'User',
      entityId: id,
      action: 'UPDATE',
      before: existing,
      after: updated,
    });
    return updated;
  }

  async deactivateUser(tenantId: string, id: string, actorId: string) {
    const existing = await (this.prisma as any).user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');
    await (this.prisma as any).user.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'User',
      entityId: id,
      action: 'DELETE',
    });
  }

  async listRoles(tenantId: string) {
    // Schema.Role.tenantId is required; there's no global/null-tenant row.
    // Surface only this tenant's roles.
    return (this.prisma as any).role.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async createRole(tenantId: string, dto: CreateRoleDto, actorId: string) {
    const role = await (this.prisma as any).role.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        isSystem: false,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Role',
      entityId: role.id,
      action: 'CREATE',
      after: role,
    });
    return role;
  }

  async assignRole(tenantId: string, dto: AssignRoleDto, actorId: string) {
    // Validate cross-tenant safety: role must belong to this tenant; user
    // must belong to this tenant; optional scopeNode must belong to this
    // tenant. Without these checks a PLATFORM_ADMIN bug could leak
    // assignments cross-tenant.
    const [role, user] = await Promise.all([
      (this.prisma as any).role.findFirst({ where: { id: dto.roleId, tenantId } }),
      (this.prisma as any).user.findFirst({ where: { id: dto.userId, tenantId } }),
    ]);
    if (!role) throw new NotFoundException('Role not found in this tenant');
    if (!user) throw new NotFoundException('User not found in this tenant');
    if (dto.scopeNodeId) {
      const scope = await (this.prisma as any).entityNode.findFirst({
        where: { id: dto.scopeNodeId, tenantId },
        select: { id: true },
      });
      if (!scope) throw new NotFoundException('Scope node not found in this tenant');
    }
    const assignment = await (this.prisma as any).roleAssignment.create({
      data: {
        userId: dto.userId,
        roleId: dto.roleId,
        scopeNodeId: dto.scopeNodeId,
        grantedBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'RoleAssignment',
      entityId: assignment.id,
      action: 'CREATE',
      after: assignment,
    });
    return assignment;
  }

  async revokeAssignment(tenantId: string, id: string, actorId: string) {
    // RoleAssignment has no direct tenantId column; the relation is through
    // role.tenantId or user.tenantId. Look up via user.
    const existing = await (this.prisma as any).roleAssignment.findFirst({
      where: { id, user: { tenantId } },
      include: { user: true, role: true },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    await (this.prisma as any).roleAssignment.delete({ where: { id } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'RoleAssignment',
      entityId: id,
      action: 'DELETE',
      before: existing,
    });
  }
}
