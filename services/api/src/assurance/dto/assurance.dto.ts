import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSnapshotDto {
  @ApiProperty()
  @IsString()
  fy!: string;

  @ApiProperty()
  @IsString()
  framework!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopeNodeIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export enum SamplingMethod {
  RANDOM = 'RANDOM',
  STRATIFIED = 'STRATIFIED',
  HIGH_VALUE = 'HIGH_VALUE',
}

export class SampleSnapshotDto {
  @ApiProperty({ enum: SamplingMethod })
  @IsEnum(SamplingMethod)
  method!: SamplingMethod;

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  size!: number;

  @ApiPropertyOptional({ description: 'Restrict to a metric key' })
  @IsOptional()
  @IsString()
  canonicalKey?: string;
}

export enum ExceptionSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class CreateExceptionDto {
  @ApiProperty()
  @IsString()
  snapshotId!: string;

  @ApiProperty()
  @IsString()
  metricEventId!: string;

  @ApiProperty({ enum: ExceptionSeverity })
  @IsEnum(ExceptionSeverity)
  severity!: ExceptionSeverity;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  description!: string;
}

export class RespondExceptionDto {
  @ApiProperty()
  @IsString()
  response!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'WONT_FIX';
}
