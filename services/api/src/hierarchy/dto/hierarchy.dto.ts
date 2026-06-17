import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum HierarchyNodeType {
  GROUP = 'GROUP',
  COMPANY = 'COMPANY',
  BUSINESS_UNIT = 'BUSINESS_UNIT',
  REGION = 'REGION',
  FACILITY = 'FACILITY',
  PROCESS = 'PROCESS',
  PRODUCT_LINE = 'PRODUCT_LINE',
}

/**
 * Codes are used as ltree path labels — must match [a-z0-9_] per ltree.
 */
const CODE_RE = /^[a-z0-9_]{1,32}$/;

export class CreateHierarchyNodeDto {
  @ApiProperty({ enum: HierarchyNodeType })
  @IsEnum(HierarchyNodeType)
  type!: HierarchyNodeType;

  @ApiProperty({ description: 'Lowercase code used in ltree path; [a-z0-9_]{1,32}', example: 'mum_01' })
  @IsString()
  @Matches(CODE_RE, { message: 'code must be lowercase alphanumeric/underscore, 1-32 chars' })
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({ description: 'Effective-from for time-aware operations (defaults: now)' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ description: 'Free-form metadata' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateHierarchyNodeDto extends PartialType(CreateHierarchyNodeDto) {}

export class MoveNodeDto {
  @ApiProperty({ description: 'New parent id (null for root)' })
  @IsOptional()
  @IsString()
  newParentId?: string | null;

  @ApiPropertyOptional({ description: 'Effective-from for the move' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class BulkImportRowDto {
  type!: HierarchyNodeType;
  code!: string;
  name!: string;
  parentCode?: string | null;
  country?: string;
  region?: string;
}
