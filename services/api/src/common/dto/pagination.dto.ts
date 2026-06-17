import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Cursor-based pagination. Cursor encodes the createdAt + id of the last
 * record from the previous page. Use opaque base64 — clients should not parse.
 */
export class PaginationDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from a prior response (`meta.nextCursor`)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
