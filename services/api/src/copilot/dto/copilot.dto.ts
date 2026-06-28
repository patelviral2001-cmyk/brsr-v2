import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Context hints for the copilot (e.g. selected scope)' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(8000)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attachments?: Record<string, unknown>;
}
