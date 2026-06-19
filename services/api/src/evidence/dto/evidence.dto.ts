import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UploadEvidenceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() siteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() docTypeHint?: string;
  @ApiPropertyOptional({ description: 'Optional period start hint (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() hintPeriodStart?: string;
  @ApiPropertyOptional({ description: 'Optional period end hint (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() hintPeriodEnd?: string;
}
