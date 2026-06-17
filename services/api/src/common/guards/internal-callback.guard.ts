import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guards internal service-to-service callbacks (e.g. AI engine extraction
 * callbacks). Validates a shared secret header in constant time.
 */
@Injectable()
export class InternalCallbackGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const provided = req.headers['x-internal-secret'];
    const expected = this.config.get<string>('INTERNAL_CALLBACK_SECRET');
    if (!expected || !provided || typeof provided !== 'string') {
      throw new UnauthorizedException('Missing internal callback secret');
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid internal callback secret');
    }
    return true;
  }
}
