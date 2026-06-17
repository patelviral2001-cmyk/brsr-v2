import { Controller, Get } from '@nestjs/common';
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
