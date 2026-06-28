import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * HMAC-signed magic links for surveys + supplier portals.
 * Token format: base64url(payload).base64url(sig). Payload includes tenantId,
 * scope ('survey' | 'supplier'), targetId, expiry epoch, and random nonce.
 */
@Injectable()
export class MagicLinkSigner {
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>('MAGIC_LINK_SECRET') ?? 'dev-magic-secret-please-change';
  }

  sign(args: {
    tenantId: string;
    scope: 'survey' | 'supplier';
    targetId: string;
    ttlSeconds: number;
    subject?: string;
  }): string {
    const payload = {
      t: args.tenantId,
      s: args.scope,
      id: args.targetId,
      exp: Math.floor(Date.now() / 1000) + args.ttlSeconds,
      sub: args.subject,
      n: randomBytes(8).toString('hex'),
    };
    const b = base64url(Buffer.from(JSON.stringify(payload)));
    const sig = this.signature(b);
    return `${b}.${sig}`;
  }

  verify(token: string): {
    tenantId: string;
    scope: 'survey' | 'supplier';
    targetId: string;
    subject?: string;
  } | null {
    const [bodyEnc, sig] = token.split('.');
    if (!bodyEnc || !sig) return null;
    const expected = this.signature(bodyEnc);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    let payload: { t: string; s: 'survey' | 'supplier'; id: string; exp: number; sub?: string };
    try {
      payload = JSON.parse(Buffer.from(bodyEnc, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (payload.exp * 1000 < Date.now()) return null;
    return { tenantId: payload.t, scope: payload.s, targetId: payload.id, subject: payload.sub };
  }

  buildUrl(token: string, basePath: string): string {
    const base = this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000';
    return `${base}${basePath}?token=${encodeURIComponent(token)}`;
  }

  private signature(b: string): string {
    return createHmac('sha256', this.secret).update(b).digest('base64url');
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}
