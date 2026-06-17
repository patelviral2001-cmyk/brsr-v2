import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import KcAdminClient from '@keycloak/keycloak-admin-client';

export interface KcUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
}

/**
 * Lightweight wrapper around @keycloak/keycloak-admin-client. Re-auths
 * lazily when the admin token expires.
 */
@Injectable()
export class KeycloakClient implements OnModuleInit {
  private readonly logger = new Logger(KeycloakClient.name);
  private readonly client: KcAdminClient;
  private readonly realm: string;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.client = new KcAdminClient({
      baseUrl: this.config.get<string>('KEYCLOAK_URL'),
      realmName: this.config.get<string>('KEYCLOAK_REALM'),
    });
    this.realm = this.config.get<string>('KEYCLOAK_REALM') ?? 'brsr';
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureAuth();
    } catch (e) {
      // Don't crash the app if Keycloak is down at boot — caller endpoints
      // will fail loudly and surface a 503 on first use.
      this.logger.warn(`Keycloak admin auth deferred: ${(e as Error).message}`);
    }
  }

  private async ensureAuth(): Promise<void> {
    if (Date.now() < this.tokenExpiresAt - 30_000) return;
    await this.client.auth({
      grantType: 'client_credentials',
      clientId: this.config.get<string>('KEYCLOAK_CLIENT_ID') ?? 'brsr-api',
      clientSecret: this.config.get<string>('KEYCLOAK_CLIENT_SECRET') ?? '',
    });
    this.tokenExpiresAt = Date.now() + 60 * 1000; // refresh aggressively
  }

  async provisionUser(args: {
    email: string;
    firstName?: string;
    lastName?: string;
    tenantId: string;
    roles?: string[];
    temporaryPassword?: string;
  }): Promise<KcUser> {
    await this.ensureAuth();
    const created = await this.client.users.create({
      realm: this.realm,
      username: args.email,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      enabled: true,
      emailVerified: false,
      attributes: { tenant_id: [args.tenantId] },
      credentials: args.temporaryPassword
        ? [{ type: 'password', value: args.temporaryPassword, temporary: true }]
        : undefined,
    });
    const id = (created as { id: string }).id;
    if (args.roles?.length) {
      await this.assignRealmRoles(id, args.roles);
    }
    const u = await this.client.users.findOne({ realm: this.realm, id });
    return mapUser(u as Record<string, unknown>);
  }

  async lookupByEmail(email: string): Promise<KcUser | null> {
    await this.ensureAuth();
    const list = await this.client.users.find({ realm: this.realm, email, exact: true });
    return list[0] ? mapUser(list[0] as Record<string, unknown>) : null;
  }

  async listUsers(args: { first?: number; max?: number; search?: string } = {}): Promise<KcUser[]> {
    await this.ensureAuth();
    const list = await this.client.users.find({
      realm: this.realm,
      first: args.first ?? 0,
      max: args.max ?? 50,
      search: args.search,
    });
    return list.map((u) => mapUser(u as Record<string, unknown>));
  }

  async sendEmailVerification(userId: string, redirectUri: string): Promise<void> {
    await this.ensureAuth();
    await this.client.users.executeActionsEmail({
      realm: this.realm,
      id: userId,
      actions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
      redirectUri,
      clientId: this.config.get<string>('KEYCLOAK_CLIENT_ID') ?? undefined,
    });
  }

  async deactivate(userId: string): Promise<void> {
    await this.ensureAuth();
    await this.client.users.update({ realm: this.realm, id: userId }, { enabled: false });
  }

  async assignRealmRoles(userId: string, roleNames: string[]): Promise<void> {
    await this.ensureAuth();
    const roles = await Promise.all(
      roleNames.map(async (name) => {
        const r = await this.client.roles.findOneByName({ realm: this.realm, name });
        return r ? { id: r.id as string, name: r.name as string } : null;
      }),
    );
    const valid = roles.filter((r): r is { id: string; name: string } => r !== null);
    if (valid.length === 0) return;
    await this.client.users.addRealmRoleMappings({
      realm: this.realm,
      id: userId,
      roles: valid,
    });
  }
}

function mapUser(u: Record<string, unknown>): KcUser {
  return {
    id: u.id as string,
    username: (u.username as string) ?? '',
    email: (u.email as string) ?? '',
    firstName: u.firstName as string | undefined,
    lastName: u.lastName as string | undefined,
    enabled: u.enabled as boolean | undefined,
    attributes: u.attributes as Record<string, string[]> | undefined,
  };
}
