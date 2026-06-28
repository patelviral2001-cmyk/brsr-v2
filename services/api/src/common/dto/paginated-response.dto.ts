import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ description: 'Cursor for next page, null if exhausted' })
  nextCursor: string | null = null;

  @ApiProperty({ description: 'True when more rows exist' })
  hasMore: boolean = false;

  @ApiProperty({ description: 'Page size echoed from request' })
  limit: number = 50;

  @ApiProperty({ description: 'Approximate total — may be omitted on large sets' })
  total?: number;
}

export class PaginatedResponse<T> {
  @ApiProperty({ isArray: true })
  data: T[] = [];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta = new PaginationMeta();

  @ApiProperty({ required: false, nullable: true })
  traceId: string | null = null;

  @ApiProperty({ required: false, nullable: true })
  requestId: string | null = null;

  static of<T>(items: T[], limit: number, nextCursor: string | null, total?: number): PaginatedResponse<T> {
    const r = new PaginatedResponse<T>();
    r.data = items;
    r.meta = { nextCursor, hasMore: nextCursor !== null, limit, total };
    return r;
  }
}

/** Encode/decode a stable cursor over (createdAt, id). */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [ts, id] = raw.split('|');
    if (!ts || !id) return null;
    return { createdAt: new Date(ts), id };
  } catch {
    return null;
  }
}
