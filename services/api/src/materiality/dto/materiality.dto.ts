import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum SurveyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export class CreateTopicDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Category (e.g. Environment/Social/Governance)' })
  @IsString()
  category!: string;

  @ApiPropertyOptional({ description: 'Map to BRSR principle (1-9)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  brsrPrinciple?: number;
}

export class CreateStakeholderDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Group, e.g. employees, suppliers, regulators' })
  @IsString()
  group!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  influence?: number;
}

export class CreateSurveyDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Topic ids included in the survey' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  topicIds!: string[];

  @ApiProperty({ description: 'Stakeholder ids invited' })
  @IsArray()
  @IsString({ each: true })
  stakeholderIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closesAt?: string;
}

export class TopicScoreDto {
  @ApiProperty()
  @IsString()
  topicId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  importance!: number;
}

export class SubmitSurveyResponseDto {
  @ApiPropertyOptional({ description: 'Optional respondent identifier' })
  @IsOptional()
  @IsString()
  respondentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  respondentEmail?: string;

  @ApiProperty({ type: [TopicScoreDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopicScoreDto)
  scores!: TopicScoreDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comments?: string;
}

export class CreateAssessmentDto {
  @ApiProperty()
  @IsString()
  surveyId!: string;

  @ApiProperty()
  @IsString()
  name!: string;
}

export class SignAssessmentDto {
  @ApiProperty()
  @IsString()
  signerName!: string;

  @ApiProperty()
  @IsString()
  signerRole!: string;

  @ApiProperty({ description: 'S3 key of the e-sign evidence (PDF)' })
  @IsString()
  evidenceS3Key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SurveyStatusDto {
  @ApiProperty({ enum: SurveyStatus })
  @IsEnum(SurveyStatus)
  status!: SurveyStatus;
}
