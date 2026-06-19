import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254) // RFC 5321 email length cap
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4096)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}
