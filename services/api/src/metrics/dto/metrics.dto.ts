import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum MetricEventStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  LOCKED = 'LOCKED',
}

export enum MetricSource {
  MANUAL = 'MANUAL',
  EXTRACTED = 'EXTRACTED',
  IMPORTED = 'IMPORTED',
  CALCULATED = 'CALCULATED',
  ERP = 'ERP',
}

export class CreateMetricEventDto {
  @ApiProperty({ description: 'Canonical metric key from registry' })
  @IsString()
  canonicalKey!: string;

  @ApiProperty({ description: 'Hierarchy node id this metric applies to' })
  @IsString()
  scopeNodeId!: string;

  @ApiProperty({ description: 'Period start (ISO 8601)' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ description: 'Period end (ISO 8601)' })
  @IsDateString()
  periodEnd!: string;

  @ApiProperty({ description: 'Numeric value (always decimal — pass as string for precision)' })
  @Type(() => Number)
  @IsNumber()
  value!: number;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiPropertyOptional({ enum: MetricSource, default: MetricSource.MANUAL })
  @IsOptional()
  @IsEnum(MetricSource)
  source?: MetricSource;

  @ApiPropertyOptional({ description: 'Document id this value is sourced from' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: 'ExtractionField id this value is sourced from' })
  @IsOptional()
  @IsString()
  extractionFieldId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Free-form metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateMetricEventDto extends PartialType(CreateMetricEventDto) {}

export class RejectMetricDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class QueryMetricsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  canonicalKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeNodeIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: MetricEventStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(MetricEventStatus, { each: true })
  status?: MetricEventStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  take?: number;
}
