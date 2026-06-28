import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

/**
 * Prometheus metrics provider. Wraps a single Registry instance so the
 * /metrics endpoint, HTTP interceptor, and business-event emitters all
 * write to the same surface.
 *
 * Conventions:
 *  - Histograms use seconds (Prometheus best practice).
 *  - Labels are bounded — we only label by stable, low-cardinality fields
 *    (route template, method, status, tenant short-hash) to avoid label
 *    explosion. NEVER label by user id or raw URL.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new client.Registry();

  readonly httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests by route, method, status',
    labelNames: ['route', 'method', 'status'],
  });

  readonly httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['route', 'method', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  });

  readonly extractionsTotal = new client.Counter({
    name: 'extractions_total',
    help: 'Document extraction outcomes',
    labelNames: ['status'],
  });

  readonly calcRunsTotal = new client.Counter({
    name: 'calc_runs_total',
    help: 'Carbon / metric calc-engine runs',
    labelNames: ['status'],
  });

  readonly reportGenerationDuration = new client.Histogram({
    name: 'report_generation_duration_seconds',
    help: 'Report generation duration in seconds',
    labelNames: ['report_type'],
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  });

  readonly authFailuresTotal = new client.Counter({
    name: 'auth_failures_total',
    help: 'Authentication failures (login, refresh)',
    labelNames: ['kind', 'reason'],
  });

  onModuleInit(): void {
    client.collectDefaultMetrics({ register: this.registry });
    this.registry.registerMetric(this.httpRequestsTotal);
    this.registry.registerMetric(this.httpRequestDuration);
    this.registry.registerMetric(this.extractionsTotal);
    this.registry.registerMetric(this.calcRunsTotal);
    this.registry.registerMetric(this.reportGenerationDuration);
    this.registry.registerMetric(this.authFailuresTotal);
  }

  /** Returns the Prometheus exposition text payload. */
  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
