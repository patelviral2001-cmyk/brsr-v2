import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum CalcEngineFramework {
  GHG = 'GHG',
  BRSR = 'BRSR',
  GRI = 'GRI',
  TCFD = 'TCFD',
  ESRS = 'ESRS',
}

export class CreateFormulaDto {
  @ApiProperty({ description: 'Output canonical metric key' })
  @IsString()
  outputKey!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'CEL-subset expression body' })
  @IsString()
  expression!: string;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiPropertyOptional({ description: 'Version label, defaults to next integer' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ enum: CalcEngineFramework, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(CalcEngineFramework, { each: true })
  frameworks?: CalcEngineFramework[];

  @ApiPropertyOptional({ description: 'Required input metric keys' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inputs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class ScopeWindowDto {
  @ApiProperty({ description: 'Period start (ISO 8601)' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ description: 'Period end (ISO 8601)' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Hierarchy node ids to include. Omit to default to all root entities for the tenant.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeNodeIds?: string[];

  @ApiPropertyOptional({ enum: CalcEngineFramework, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(CalcEngineFramework, { each: true })
  frameworks?: CalcEngineFramework[];

  @ApiPropertyOptional({ description: 'Restrict to specific output keys' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outputKeys?: string[];
}

export class CalcRunRequestDto extends ScopeWindowDto {
  @ApiPropertyOptional({ description: 'Idempotency key — duplicate requests with the same key are de-duped' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class Scope3CategoryDto {
  @ApiProperty({ minimum: 1, maximum: 15 })
  @IsInt()
  @Min(1)
  @Max(15)
  category!: number;

  @ApiProperty()
  @ValidateNested()
  @Type(() => ScopeWindowDto)
  window!: ScopeWindowDto;
}
