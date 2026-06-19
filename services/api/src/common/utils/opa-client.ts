import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface OpaInput {
  subject: {
    id: string;
    email: string;
    roles: string[];
    scopes: string[];
    tenantId: string;
  };
  action: string[];
  resource: {
    route: string;
    method: string;
    params?: Record<string, unknown>;
    body?: Record<string, unknown> | undefined;
  };
  context: Record<string, unknown>;
}

export interface OpaDecision {
  allow: boolean;
  reason?: string;
  obligations?: Record<string, unknown>;
}

@Injectable()
export class OpaClient {
  private readonly logger = new Logger(OpaClient.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('OPA_URL') ?? 'http://localhost:8181';
    // Default OFF — Phase 0+1 uses RBAC via @RequirePermissions decorators.
    // Set OPA_ENABLED=true to route authorization through an external Rego policy engine.
    this.enabled = this.config.get<string>('OPA_ENABLED', 'false') === 'true';
  }

  /**
   * Evaluates the `data.brsr.allow` policy. The expected Rego shape is:
   *   package brsr
   *   default allow := false
   *   default reason := ""
   *   allow { ... }
   *
   * We post to /v1/data/brsr and unwrap `result.allow` + `result.reason`.
   */
  /** Exposed so AbacGuard can decide to apply its RBAC fallback. */
  isEnabled(): boolean {
    return this.enabled;
  }

  async allow(input: OpaInput): Promise<OpaDecision> {
    if (!this.enabled) {
      // Dev/test mode — allow but log so engineers see it.
      // NOTE: AbacGuard short-circuits to RBAC when OPA is disabled, so this
      // branch is only hit if a caller invokes the OPA client directly.
      this.logger.debug(`OPA disabled — granting ${input.action.join(',')}`);
      return { allow: true };
    }

    try {
      const url = `${this.baseUrl}/v1/data/brsr`;
      const res = await firstValueFrom(
        this.http.post<{ result?: { allow?: boolean; reason?: string; obligations?: Record<string, unknown> } }>(
          url,
          { input },
          { timeout: 2000 },
        ),
      );
      const result = res.data.result ?? {};
      return {
        allow: !!result.allow,
        reason: result.reason,
        obligations: result.obligations,
      };
    } catch (err) {
      // Fail-closed: deny on OPA outage. Operators can flip OPA_ENABLED=false
      // explicitly during an incident if they accept the risk.
      this.logger.error(`OPA query failed: ${(err as Error).message}`);
      return { allow: false, reason: 'Policy engine unavailable' };
    }
  }
}
