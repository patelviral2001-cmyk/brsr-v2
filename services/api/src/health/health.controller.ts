import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { S3Storage } from '../common/utils/s3.client';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Storage,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  /**
   * Aggregated health probe. Kept for backwards compatibility with the Caddy
   * upstream check and the deploy script. New callers should prefer
   * /health/live (liveness) or /health/ready (readiness).
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + dependency reachability probe' })
  async check() {
    const [db, redis, s3, ai] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.s3.health().catch(() => false),
      this.checkAi(),
    ]);

    const overall = db && redis && s3 && ai;

    return {
      status: overall ? 'ok' : 'degraded',
      checks: { db, redis, s3, ai },
      version: process.env.npm_package_version ?? '2.0.0',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Liveness probe — purely "the Nest process is running and able to respond
   * to HTTP". MUST NOT depend on Postgres/Redis/S3, otherwise an upstream
   * outage will get the pod restart-looped (which doesn't help anyone).
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Kubernetes-style liveness probe (process up)' })
  live() {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe — only returns OK when this instance can actually serve
   * traffic (DB + Redis reachable). Caddy / k8s should remove the pod from
   * the rotation when this flips to 503.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Kubernetes-style readiness probe (deps reachable)' })
  async ready() {
    // Bounded timeouts so a single slow dep can't pin the readiness check —
    // every probe gets its own deadline.
    const [db, redis, s3, ai] = await Promise.all([
      this.withTimeout(this.checkDb(), 1500, false),
      this.withTimeout(this.checkRedis(), 1500, false),
      this.withTimeout(this.s3.health().catch(() => false), 2000, false),
      this.withTimeout(this.checkAi(), 2000, false),
    ]);
    // db + redis are hard dependencies — without either we cannot serve.
    // s3 + ai are soft: surface as degraded rather than removing from rotation,
    // because reads of cached data still work.
    const critical = db && redis;
    if (!critical) {
      throw new ServiceUnavailableException({ status: 'not_ready', checks: { db, redis, s3, ai } });
    }
    const degraded = !(s3 && ai);
    return {
      status: degraded ? 'degraded' : 'ok',
      checks: { db, redis, s3, ai },
    };
  }

  private withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      if (this.redis.status === 'wait' || this.redis.status === 'end') {
        await this.redis.connect();
      }
      const r = await this.redis.ping();
      return r === 'PONG';
    } catch {
      return false;
    }
  }

  private async checkAi(): Promise<boolean> {
    try {
      const url = `${this.config.get<string>('AI_ENGINE_URL')}/health`;
      const res = await firstValueFrom(this.http.get(url, { timeout: 2000 }));
      return res.status >= 200 && res.status < 500;
    } catch {
      return false;
    }
  }
}
