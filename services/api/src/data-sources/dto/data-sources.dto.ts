import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export enum DataSourceKind {
  SAP = 'SAP',
  ORACLE = 'ORACLE',
  WORKDAY = 'WORKDAY',
  SHEETS = 'SHEETS',
  CSV_UPLOAD = 'CSV_UPLOAD',
  IOT = 'IOT',
  CUSTOM_API = 'CUSTOM_API',
}

export class CreateDataSourceDto {
  @ApiProperty({ enum: DataSourceKind })
  @IsEnum(DataSourceKind)
  kind!: DataSourceKind;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Configuration (host, schema mappings, etc.). Secrets stored separately.' })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Encrypted credentials reference (vault path)' })
  @IsOptional()
  @IsString()
  secretRef?: string;

  @ApiPropertyOptional({ description: 'Cron expression for scheduled syncs' })
  @IsOptional()
  @IsString()
  cron?: string;
}

export class UpdateDataSourceDto extends PartialType(CreateDataSourceDto) {}
