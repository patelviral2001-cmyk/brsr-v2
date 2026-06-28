import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ minLength: 2, maxLength: 64 })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], description: 'Permission strings, e.g. metric.write' })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class AssignRoleDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  roleId!: string;

  @ApiPropertyOptional({ description: 'HierarchyNode id this assignment is scoped to (null = global)' })
  @IsOptional()
  @IsString()
  scopeNodeId?: string;
}
