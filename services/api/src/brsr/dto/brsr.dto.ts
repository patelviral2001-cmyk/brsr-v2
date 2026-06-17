import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export enum BrsrFramework {
  BRSR = 'BRSR',
  BRSR_CORE = 'BRSR_CORE',
  GRI = 'GRI',
  TCFD = 'TCFD',
  ESRS = 'ESRS',
  IFRS_S1 = 'IFRS_S1',
  IFRS_S2 = 'IFRS_S2',
}

export class ResolveBrsrDto {
  @ApiProperty({ description: 'Fiscal year (e.g. "FY24-25")' })
  @IsString()
  fy!: string;

  @ApiProperty({ enum: BrsrFramework })
  @IsEnum(BrsrFramework)
  framework!: BrsrFramework;

  @ApiProperty({ description: 'Hierarchy node ids in scope (typically the COMPANY id)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopeNodeIds!: string[];

  @ApiPropertyOptional({ description: 'Restrict to a specific BRSR section (e.g. "P3.E.1")' })
  @IsOptional()
  @IsString()
  section?: string;
}

export class PreviewBrsrDto extends ResolveBrsrDto {}

export class GenerateReportDto extends ResolveBrsrDto {
  @ApiPropertyOptional({ description: 'Output formats', isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formats?: ('pdf' | 'xlsx' | 'xbrl')[];

  @ApiPropertyOptional({ description: 'Restrict to specific principles (1..9)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  principles?: number[];
}

export class MappingFilterDto {
  @ApiPropertyOptional({ enum: BrsrFramework })
  @IsOptional()
  @IsEnum(BrsrFramework)
  framework?: BrsrFramework;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  version?: string;
}

export class ResolvedSectionDto {
  @ApiProperty()
  sectionId!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: unknown;

  @ApiProperty()
  unit?: string;

  @ApiProperty({ type: [String] })
  sourceMetricEventIds!: string[];

  @ApiProperty({ description: 'Reference to underlying CalcRun if computed' })
  calcRunId?: string | null;

  @ApiPropertyOptional()
  @ValidateNested()
  @Type(() => Object)
  evidence?: { documentIds: string[]; extractionFieldIds: string[] };
}
