import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Common filter primitives composed by feature-specific DTOs.
 */
export class CommonFilterDto {
  @ApiPropertyOptional({ description: 'Full-text search on labels/names/codes' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Period start (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Period end (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter by scope hierarchy node id(s)' })
  @IsOptional()
  @IsArray()
  @Type(() => String)
  scopeNodeIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by status', isArray: true })
  @IsOptional()
  @IsArray()
  status?: string[];

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
