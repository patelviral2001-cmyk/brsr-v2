import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Allow, IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({ description: 'Document type hint for the extractor', example: 'utility_bill' })
  @IsOptional()
  @IsString()
  docType?: string;

  @ApiPropertyOptional({ description: 'Hierarchy node this evidence belongs to' })
  @IsOptional()
  @IsString()
  scopeNodeId?: string;

  @ApiPropertyOptional({ description: 'Reporting period start ISO 8601' })
  @IsOptional()
  @IsString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  periodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tags?: string;
}

export class ExtractionFieldCallbackDto {
  @ApiProperty()
  @IsString()
  fieldKey!: string;

  // `value` accepts number | string | null | array depending on metric kind.
  // class-validator's whitelist drops properties with NO @Is* decorator; the
  // explicit @Allow() keeps it through validation without forcing a type.
  @ApiProperty()
  @Allow()
  value!: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ description: '0..1 model confidence' })
  @IsNumber()
  confidence!: number;

  @ApiPropertyOptional({ description: 'Page number where the value was found' })
  @IsOptional()
  @IsNumber()
  pageNumber?: number;

  @ApiPropertyOptional({ description: 'Bounding box [x1,y1,x2,y2]' })
  @IsOptional()
  @IsArray()
  bbox?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceText?: string;

  // Carry the period the AI engine parsed from the document text. Without
  // these, the auto-promote to metric_event silently skips (metric_events
  // require period_start/end) and the document→metric lineage breaks.
  @ApiPropertyOptional({ description: 'Period start, ISO 8601 date' })
  @IsOptional()
  @IsString()
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Period end, ISO 8601 date' })
  @IsOptional()
  @IsString()
  periodEnd?: string;
}

export class ExtractionCallbackDto {
  @ApiProperty()
  @IsString()
  documentId!: string;

  @ApiProperty()
  @IsString()
  tenantId!: string;

  @ApiProperty()
  @IsString()
  status!: 'EXTRACTED' | 'FAILED' | 'PARTIAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;

  @ApiProperty({ type: [ExtractionFieldCallbackDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractionFieldCallbackDto)
  fields!: ExtractionFieldCallbackDto[];

  @ApiPropertyOptional({ description: 'Composite document-level confidence' })
  @IsOptional()
  @IsNumber()
  documentConfidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsReview?: boolean;
}
