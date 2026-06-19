import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export enum ExtractionFieldStatus {
  DRAFT = 'DRAFT',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  OVERRIDDEN = 'OVERRIDDEN',
}

export class UpdateExtractionFieldDto {
  // The corrected value can be number | string | object (table cell, JSON),
  // so we can't narrow the type. @Allow keeps the property whitelisted
  // through the global ValidationPipe (whitelist + forbidNonWhitelisted) —
  // without it, the value would be silently stripped and the PATCH would
  // 400 with "property value should not exist".
  @ApiProperty({ description: 'Reviewer-corrected value' })
  @Allow()
  value!: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectExtractionFieldDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class BulkApproveDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids!: string[];
}

export class ExtractionQueueQueryDto {
  @ApiPropertyOptional({ description: 'Maximum confidence to include in the queue (0..1, default 0.85)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  maxConfidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ enum: ExtractionFieldStatus })
  @IsOptional()
  @IsEnum(ExtractionFieldStatus)
  status?: ExtractionFieldStatus;

  @ApiPropertyOptional({ description: 'Page size (1..200)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  cursor?: Record<string, unknown>;
}
