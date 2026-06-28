import { Body, Controller, Get, Param, Post, Res, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CopilotService } from './copilot.service';
import { CreateConversationDto, SendMessageDto } from './dto/copilot.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

@ApiTags('copilot')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('copilot')
export class CopilotController {
  constructor(private readonly svc: CopilotService) {}

  @Post('conversations')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    return this.svc.createConversation(user.tenantId, dto, user.id);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listConversations(user.tenantId, user.id);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.listMessages(user.tenantId, id, user.id);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a user message; streams the assistant reply over SSE' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    return this.svc.streamReply(user.tenantId, id, user.id, dto, res);
  }
}
