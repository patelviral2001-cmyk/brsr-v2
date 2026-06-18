import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { Public } from '../decorators/public.decorator';

/**
 * Prometheus scrape endpoint. Mounted outside the `api/v1` prefix at
 * `/metrics-prom` (the main.ts global-prefix exclude list whitelists
 * `metrics-prom`). Public because Prometheus does not send a Bearer token —
 * production deploys MUST restrict this path at the proxy layer to internal
 * scrapers only (Caddy is configured to keep it on the internal network).
 */
@ApiExcludeController()
@Controller('metrics-prom')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<string> {
    return this.metrics.scrape();
  }
}
