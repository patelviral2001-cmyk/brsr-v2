import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaterialityService } from './materiality.service';
import {
  CreateAssessmentDto,
  CreateStakeholderDto,
  CreateSurveyDto,
  CreateTopicDto,
  SignAssessmentDto,
  SubmitSurveyResponseDto,
} from './dto/materiality.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AbacGuard } from '../common/guards/abac.guard';
import { Public } from '../common/decorators/public.decorator';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('materiality')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor, AuditInterceptor)
@Controller('materiality')
export class MaterialityController {
  constructor(private readonly svc: MaterialityService) {}

  @Get('topics')
  topics(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listTopics(user.tenantId);
  }

  @Post('topics')
  @UseGuards(AbacGuard)
  @RequirePermissions('materiality.write')
  @Audit({ entity: 'MaterialityTopic', action: 'create' })
  createTopic(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTopicDto) {
    return this.svc.createTopic(user.tenantId, dto, user.id);
  }

  @Get('stakeholders')
  stakeholders(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listStakeholders(user.tenantId);
  }

  @Post('stakeholders')
  @UseGuards(AbacGuard)
  @RequirePermissions('materiality.write')
  @Audit({ entity: 'Stakeholder', action: 'create' })
  createStakeholder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStakeholderDto) {
    return this.svc.createStakeholder(user.tenantId, dto, user.id);
  }

  @Post('surveys')
  @UseGuards(AbacGuard)
  @RequirePermissions('materiality.write')
  @Audit({ entity: 'Survey', action: 'create' })
  createSurvey(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSurveyDto) {
    return this.svc.createSurvey(user.tenantId, dto, user.id);
  }

  @Post('surveys/:id/launch')
  @UseGuards(AbacGuard)
  @RequirePermissions('materiality.write')
  @Audit({ entity: 'Survey', action: 'launch' })
  launch(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.launchSurvey(user.tenantId, id, user.id);
  }

  @Public()
  @Post('surveys/:id/responses')
  @ApiOperation({ summary: 'Public endpoint — submit a survey response (requires magic token)' })
  submit(
    @Param('id', ParseCuidPipe) id: string,
    @Query('token') token: string,
    @Body() dto: SubmitSurveyResponseDto,
  ) {
    return this.svc.submitResponse(id, token, dto);
  }

  @Post('surveys/:id/close')
  @UseGuards(AbacGuard)
  @RequirePermissions('materiality.write')
  @Audit({ entity: 'Survey', action: 'close' })
  close(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.closeSurvey(user.tenantId, id, user.id);
  }

  @Post('assessments')
  @UseGuards(AbacGuard)
  @RequirePermissions('materiality.write')
  @Audit({ entity: 'AssessmentRun', action: 'create' })
  createAssessment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssessmentDto) {
    return this.svc.createAssessment(user.tenantId, dto, user.id);
  }

  @Get('assessments/:id')
  getAssessment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseCuidPipe) id: string) {
    return this.svc.getAssessment(user.tenantId, id);
  }

  @Post('assessments/:id/sign')
  @UseGuards(AbacGuard)
  @RequirePermissions('materiality.sign')
  @Audit({ entity: 'AssessmentRun', action: 'sign' })
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: SignAssessmentDto,
  ) {
    return this.svc.signAssessment(user.tenantId, id, dto, user.id);
  }
}
