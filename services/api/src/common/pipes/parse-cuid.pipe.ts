import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const CUID_RE = /^c[a-z0-9]{20,32}$/i;

/**
 * Validates that a route param is a Prisma cuid (v1 or v2). Use when binding
 * `:id` to a Prisma PK.
 */
@Injectable()
export class ParseCuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value || typeof value !== 'string' || !CUID_RE.test(value)) {
      throw new BadRequestException(`Invalid identifier: ${value}`);
    }
    return value;
  }
}
