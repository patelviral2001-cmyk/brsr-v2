import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class EmissionsQueryDto {
  @ApiProperty({ description: 'Scope number (1|2|3)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  scope!: number;

  @ApiProperty({ description: 'Period start (ISO 8601)' })
  @IsDateString()
  from!: string;

  @ApiProperty()
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeNodeIds?: string[];
}

export class Scope3RunDto {
  @ApiProperty()
  @IsDateString()
  periodStart!: string;

  @ApiProperty()
  @IsDateString()
  periodEnd!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopeNodeIds!: string[];
}

export enum SbtiTargetType {
  ABSOLUTE = 'ABSOLUTE',
  INTENSITY = 'INTENSITY',
  NET_ZERO = 'NET_ZERO',
}

export class CreateSbtiTargetDto {
  @ApiProperty({ enum: SbtiTargetType })
  @IsEnum(SbtiTargetType)
  type!: SbtiTargetType;

  @ApiProperty({ description: 'Baseline year (e.g. 2019)' })
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  baselineYear!: number;

  @ApiProperty({ description: 'Target year' })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  targetYear!: number;

  @ApiProperty({ description: 'Reduction percentage from baseline (e.g. 50 means 50%)' })
  @Type(() => Number)
  @IsNumber()
  reductionPercent!: number;

  @ApiPropertyOptional({ description: 'Scope coverage, e.g. ["S1","S2"] or ["S1","S2","S3"]' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSbtiTargetDto extends PartialType(CreateSbtiTargetDto) {}

export class CreateAbatementProjectDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Annual tCO2e reduction' })
  @Type(() => Number)
  @IsNumber()
  annualAbatementTco2e!: number;

  @ApiProperty({ description: 'Capex in USD' })
  @Type(() => Number)
  @IsNumber()
  capexUsd!: number;

  @ApiPropertyOptional({ description: 'Annual operating cost change in USD (negative = savings)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  annualOpexDeltaUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lifetimeYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  discountRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeNodeId?: string;
}

export class UpdateAbatementProjectDto extends PartialType(CreateAbatementProjectDto) {}

export class CreateCarbonCreditDto {
  @ApiProperty()
  @IsString()
  registry!: string;

  @ApiProperty()
  @IsString()
  serial!: string;

  @ApiProperty({ description: 'Vintage year' })
  @Type(() => Number)
  @IsInt()
  vintage!: number;

  @ApiProperty({ description: 'Quantity in tCO2e' })
  @Type(() => Number)
  @IsNumber()
  quantityTco2e!: number;

  @ApiProperty({ description: 'Price per tCO2e in USD' })
  @Type(() => Number)
  @IsNumber()
  pricePerTco2eUsd!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectType?: string;
}

export class UpdateCarbonCreditDto extends PartialType(CreateCarbonCreditDto) {}
