import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateTenantBrandingDto {
  @ApiPropertyOptional({ description: 'Public URL of the logo (PNG/SVG)' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Primary brand colour (#RRGGBB)' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ description: 'Secondary brand colour (#RRGGBB)' })
  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reportFooter?: string;

  @ApiPropertyOptional({ description: 'Display name override' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

export class UpdateTenantSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  value?: unknown;
}
