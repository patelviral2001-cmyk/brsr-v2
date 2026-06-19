import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** AI engine → backend: one extraction result per document. */
export class ExtractionCallbackDto {
  @ApiProperty() @IsString() documentId!: string;            // (evidence id)
  @ApiProperty() @IsString() tenantId!: string;
  @ApiProperty({ description: 'Document-specific schema code' }) @IsString() schemaCode!: string;
  @ApiProperty({ description: 'Document-typed payload. Validated by promotion step.' }) @Allow() payload!: unknown;
  @ApiProperty() @IsNumber() confidence!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() rawText?: string;
  @ApiPropertyOptional({ description: 'Optional doc-type override from classifier' })
  @IsOptional() @IsString() docTypeDetected?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() error?: string;
}

/**
 * User-confirmed Data Points payload on the Evidence Review screen.
 * The reviewer corrects each field, picks a site, picks a period, hits Confirm.
 */
class ConfirmedDataPointDto {
  @ApiProperty() @IsString() kpiCode!: string;
  @ApiProperty() @Allow() payload!: unknown;       // shape per KPI.payloadKind
  @ApiPropertyOptional() @IsOptional() @IsNumber() confidence?: number;
}

export class ConfirmExtractionDto {
  @ApiProperty() @IsString() siteId!: string;
  @ApiProperty() @IsDateString() periodStart!: string;
  @ApiProperty() @IsDateString() periodEnd!: string;
  @ApiProperty({ type: [ConfirmedDataPointDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ConfirmedDataPointDto)
  dataPoints!: ConfirmedDataPointDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() reportingEntityId?: string;
}
