import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

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

  @ApiProperty()
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
