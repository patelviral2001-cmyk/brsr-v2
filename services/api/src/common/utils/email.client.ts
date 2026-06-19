import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Postmark email client (transactional). In dev (no token) we just log.
 */
@Injectable()
export class EmailClient {
  private readonly logger = new Logger(EmailClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async send(args: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    const token = this.config.get<string>('POSTMARK_TOKEN');
    const from = this.config.get<string>('EMAIL_FROM') ?? 'no-reply@theesg.in';

    if (!token || token === 'changeme') {
      this.logger.log(`[email-stub] to=${args.to} subject="${args.subject}"`);
      return;
    }

    try {
      await firstValueFrom(
        this.http.post(
          'https://api.postmarkapp.com/email',
          {
            From: from,
            To: args.to,
            Subject: args.subject,
            HtmlBody: args.html,
            TextBody: args.text ?? stripHtml(args.html),
            MessageStream: 'outbound',
          },
          { headers: { 'X-Postmark-Server-Token': token, Accept: 'application/json' } },
        ),
      );
    } catch (e) {
      this.logger.error(`Email send failed: ${(e as Error).message}`);
    }
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}
