import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class ExchangeCodeDto {
  @ApiProperty({ description: 'Authorization code from Keycloak OIDC redirect' })
  @IsString()
  @MaxLength(2048)
  code!: string;

  @ApiProperty({ description: 'Redirect URI used to obtain the code', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirectUri?: string;

  @ApiProperty({ required: false, description: 'PKCE code verifier' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  codeVerifier?: string;
}

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
