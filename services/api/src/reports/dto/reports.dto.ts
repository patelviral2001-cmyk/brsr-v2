import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FileReportDto {
  @ApiProperty({ description: 'Regulator filing reference number' })
  @IsString()
  @MaxLength(120)
  filingReference!: string;

  @ApiPropertyOptional({ description: 'Date filed (ISO 8601)' })
  @IsOptional()
  @IsString()
  filedAt?: string;
}

export class ApproveReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
