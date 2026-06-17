import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsEmail()
  contactEmail!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Free-form metadata (size, spend tier, etc.)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class InviteSupplierDto {
  @ApiPropertyOptional({ description: 'Override default contact email for the invite' })
  @IsOptional()
  @IsEmail()
  toEmail?: string;

  @ApiPropertyOptional({ description: 'Questionnaire template id' })
  @IsOptional()
  @IsString()
  questionnaireId?: string;
}

export class SupplierAnswerDto {
  @ApiProperty()
  @IsString()
  questionId!: string;

  @ApiProperty()
  value!: unknown;
}

export class SupplierEvidenceDto {
  @ApiProperty()
  @IsString()
  questionId!: string;

  @ApiProperty({ description: 'S3 key of the uploaded evidence' })
  @IsString()
  s3Key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;
}

export class SubmitSupplierResponseDto {
  @ApiProperty({ type: [SupplierAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierAnswerDto)
  answers!: SupplierAnswerDto[];

  @ApiPropertyOptional({ type: [SupplierEvidenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierEvidenceDto)
  evidence?: SupplierEvidenceDto[];
}
