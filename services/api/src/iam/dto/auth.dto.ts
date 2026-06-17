import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ExchangeCodeDto {
  @ApiProperty({ description: 'Authorization code from Keycloak OIDC redirect' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Redirect URI used to obtain the code', required: false })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiProperty({ required: false, description: 'PKCE code verifier' })
  @IsOptional()
  @IsString()
  codeVerifier?: string;
}
