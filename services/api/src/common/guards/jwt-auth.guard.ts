import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwksClient from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface KeycloakClaims extends jwt.JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  tenant_id?: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  scope?: string;
}

/**
 * Validates Keycloak-issued JWTs using JWKS. Extracts tenant_id, roles and
 * scopes from claims and attaches the resulting principal to `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwks: jwksClient.JwksClient;
  private readonly issuer: string;
  private readonly audience?: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    const cfg = this.config;
    const kcUrl = cfg?.get<string>('KEYCLOAK_URL') ?? 'http://localhost:8080';
    const kcRealm = cfg?.get<string>('KEYCLOAK_REALM') ?? 'brsr';
    this.issuer = cfg?.get<string>('JWT_ISSUER') ?? `${kcUrl}/realms/${kcRealm}`;
    this.audience = cfg?.get<string>('JWT_AUDIENCE') ?? undefined;
    try {
      this.jwks = jwksClient({
        jwksUri: `${this.issuer}/protocol/openid-connect/certs`,
        cache: true,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      });
    } catch (e) {
      this.logger.warn(`JWKS client init failed; JWT validation disabled: ${e}`);
      this.jwks = null as any;
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims: KeycloakClaims;
    try {
      claims = await this.verify(token);
    } catch (err) {
      this.logger.warn(`JWT verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    const tenantId = claims.tenant_id;
    if (!tenantId) {
      throw new UnauthorizedException('Token missing tenant_id claim');
    }

    const realmRoles = claims.realm_access?.roles ?? [];
    const clientId = this.config.get<string>('KEYCLOAK_CLIENT_ID') ?? 'brsr-api';
    const clientRoles = claims.resource_access?.[clientId]?.roles ?? [];
    const roles = [...new Set([...realmRoles, ...clientRoles])];
    const scopes = (claims.scope ?? '').split(' ').filter(Boolean);

    (req as any).user = {
      id: claims.sub,
      sub: claims.sub,
      email: claims.email ?? claims.preferred_username ?? '',
      tenantId,
      roles,
      scopes,
      claims,
    };
    (req as any).tenantId = tenantId;
    return true;
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7);
    return null;
  }

  private verify(token: string): Promise<KeycloakClaims> {
    return new Promise((resolve, reject) => {
      const getKey: jwt.GetPublicKeyOrSecret = (header, cb) => {
        if (!header.kid) return cb(new Error('JWT missing kid'));
        this.jwks
          .getSigningKey(header.kid)
          .then((k) => cb(null, k.getPublicKey()))
          .catch((e) => cb(e));
      };

      jwt.verify(
        token,
        getKey,
        {
          algorithms: ['RS256'],
          issuer: this.issuer,
          audience: this.audience,
          ignoreExpiration: false,
        },
        (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded as KeycloakClaims);
        },
      );
    });
  }
}
