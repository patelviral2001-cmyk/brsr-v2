import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantBrandingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() primaryColor?: string;
}
