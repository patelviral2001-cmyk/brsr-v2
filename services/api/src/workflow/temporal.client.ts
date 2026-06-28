import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StartWorkflowArgs {
  workflowType: string;
  taskQueue: string;
  workflowId: string;
  input: Record<string, unknown>;
}

/**
 * Temporal client stub. Wired into DI but disabled unless TEMPORAL_ENABLED=true
 * and an actual @temporalio/client is installed and configured. The workflow
 * definitions themselves live in services/workflow/.
 *
 * Currently registered workflow types:
 *   - data-approval (metric → review → approve → lock)
 *   - report-assurance (snapshot → sample → exceptions → sign-off)
 *   - supplier-onboarding (invite → reminder → score → publish)
 */
@Injectable()
export class TemporalClient {
  private readonly logger = new Logger(TemporalClient.name);
  private readonly enabled: boolean;
  private readonly address: string;
  private readonly namespace: string;
  // Lazily-initialised — when wired up, this is the real @temporalio/client Client.
  private real: { start: (args: StartWorkflowArgs) => Promise<string> } | null = null;

  constructor(private readonly config: ConfigService) {
    this.enabled = (this.config.get<string>('TEMPORAL_ENABLED') ?? 'false').toLowerCase() === 'true';
    this.address = this.config.get<string>('TEMPORAL_ADDRESS') ?? 'localhost:7233';
    this.namespace = this.config.get<string>('TEMPORAL_NAMESPACE') ?? 'brsr';
    this.logger.log(`Temporal client ${this.enabled ? 'ENABLED' : 'DISABLED'} (${this.address} ns=${this.namespace})`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  registerImpl(impl: { start: (args: StartWorkflowArgs) => Promise<string> }): void {
    this.real = impl;
  }

  /**
   * Starts a workflow. When the temporal client isn't enabled this is a no-op
   * that returns a synthetic run id so calling code can continue.
   */
  async start(args: StartWorkflowArgs): Promise<{ runId: string; sync: boolean }> {
    if (this.enabled && this.real) {
      const runId = await this.real.start(args);
      return { runId, sync: false };
    }
    this.logger.debug(`[temporal:disabled] would start ${args.workflowType} (${args.workflowId})`);
    return { runId: `stub-${args.workflowId}-${Date.now()}`, sync: true };
  }
}
