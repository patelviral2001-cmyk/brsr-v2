import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateExtractionFieldDto {
  @ApiProperty({ description: 'Reviewer-corrected value' })
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
  @IsString({ each: true })
  ids!: string[];
}

export class ExtractionQueueQueryDto {
  @ApiPropertyOptional({ description: 'Maximum confidence to include in the queue (default 0.85)' })
  @IsOptional()
  @IsNumber()
  maxConfidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  take?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  cursor?: Record<string, unknown>;
}
