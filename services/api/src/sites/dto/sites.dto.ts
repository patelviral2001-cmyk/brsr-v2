import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum, MaxLength } from 'class-validator';

export enum SiteType {
  OFFICE = 'OFFICE',
  MANUFACTURING = 'MANUFACTURING',
  WAREHOUSE = 'WAREHOUSE',
  TOLL_PLAZA = 'TOLL_PLAZA',
  STREET_LIGHTING = 'STREET_LIGHTING',
  SOLAR_PLANT = 'SOLAR_PLANT',
  WIND_PLANT = 'WIND_PLANT',
  RETAIL = 'RETAIL',
  DATA_CENTER = 'DATA_CENTER',
  OTHER = 'OTHER',
}

export class CreateSiteDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) externalCode?: string;
  @ApiProperty({ enum: SiteType }) @IsEnum(SiteType) siteType!: SiteType;
  @ApiPropertyOptional() @IsOptional() @IsString() reportingEntityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() district?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pincode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() areaSqm?: number;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}
