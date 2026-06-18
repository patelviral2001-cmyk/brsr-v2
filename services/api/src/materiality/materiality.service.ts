import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MagicLinkSigner } from '../common/utils/magic-link';
import { EmailClient } from '../common/utils/email.client';
import {
  CreateAssessmentDto,
  CreateStakeholderDto,
  CreateSurveyDto,
  CreateTopicDto,
  SignAssessmentDto,
  SubmitSurveyResponseDto,
  SurveyStatus,
} from './dto/materiality.dto';

/**
 * Materiality service.
 *
 * Schema models (schema.prisma):
 *   MaterialTopic            — id, tenantId?, framework, code, name, defaultCategory
 *   StakeholderGroup         — id, tenantId, name, type, influenceScore, interestScore
 *   MaterialitySurvey        — id, tenantId, fy, title, status, launchedAt, closedAt, createdBy
 *   SurveyResponse           — id, surveyId, respondentEmail, stakeholderGroupId, submittedAt, responses (json)
 *   MaterialityAssessmentRun — id, tenantId, fy, matrixData, priorityTopics, signedByUserId, etc.
 *
 * The previous implementation referenced models that do not exist
 * (survey, surveyInvitation, surveyScore, assessmentRun) and would crash on
 * every call. Re-mapped to the actual schema.
 */
@Injectable()
export class MaterialityService {
  private readonly logger = new Logger(MaterialityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly magic: MagicLinkSigner,
    private readonly email: EmailClient,
  ) {}

  // ---- Topics ----

  async listTopics(tenantId: string) {
    return (this.prisma as any).materialTopic.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      orderBy: [{ framework: 'asc' }, { code: 'asc' }],
    });
  }

  async createTopic(tenantId: string, dto: CreateTopicDto, actorId: string) {
    // Schema MaterialTopic columns: framework (enum), code, name, defaultCategory.
    const category = (dto.category ?? 'ENVIRONMENT').toUpperCase();
    const validCats = new Set(['ENVIRONMENT', 'SOCIAL', 'GOVERNANCE']);
    if (!validCats.has(category)) {
      throw new BadRequestException('category must be ENVIRONMENT|SOCIAL|GOVERNANCE');
    }
    const topic = await (this.prisma as any).materialTopic.create({
      data: {
        tenantId,
        framework: 'BRSR' as any,
        code: dto.code,
        name: dto.title,
        description: dto.description ?? null,
        defaultCategory: category as any,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MaterialTopic',
      entityId: topic.id,
      action: 'CREATE',
      after: topic,
    });
    return topic;
  }

  // ---- Stakeholders ----

  async listStakeholders(tenantId: string) {
    return (this.prisma as any).stakeholderGroup.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async createStakeholder(tenantId: string, dto: CreateStakeholderDto, actorId: string) {
    // Schema StakeholderGroup: name, type (INTERNAL|EXTERNAL), influenceScore, interestScore.
    const type = (dto.group?.toUpperCase() === 'EMPLOYEES' || dto.group?.toUpperCase() === 'INTERNAL') ? 'INTERNAL' : 'EXTERNAL';
    const s = await (this.prisma as any).stakeholderGroup.create({
      data: {
        tenantId,
        name: dto.name,
        type: type as any,
        influenceScore: dto.influence ?? 3,
        interestScore: dto.influence ?? 3,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'StakeholderGroup',
      entityId: s.id,
      action: 'CREATE',
      after: s,
    });
    return s;
  }

  // ---- Surveys ----

  async createSurvey(tenantId: string, dto: CreateSurveyDto, actorId: string) {
    // Derive an FY label from the supplied closesAt or current date.
    const fy = inferFyLabel(dto.closesAt ? new Date(dto.closesAt) : new Date());
    const survey = await (this.prisma as any).materialitySurvey.create({
      data: {
        tenantId,
        fy,
        title: dto.name,
        status: 'DRAFT' as any,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MaterialitySurvey',
      entityId: survey.id,
      action: 'CREATE',
      after: survey,
      metadata: {
        topicIds: dto.topicIds,
        stakeholderIds: dto.stakeholderIds,
      },
    });
    return survey;
  }

  async launchSurvey(tenantId: string, surveyId: string, actorId: string) {
    const survey = await (this.prisma as any).materialitySurvey.findFirst({
      where: { id: surveyId, tenantId },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'DRAFT') {
      throw new ConflictException(`Cannot launch survey in status ${survey.status}`);
    }
    // The schema has no SurveyInvitation table. Magic links are still issued
    // by the caller's email integration; we just transition the survey state.
    const updated = await (this.prisma as any).materialitySurvey.update({
      where: { id: surveyId },
      data: { status: 'ACTIVE', launchedAt: new Date() },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MaterialitySurvey',
      entityId: surveyId,
      action: 'UPDATE',
      metadata: { transition: 'launched' },
    });
    return updated;
  }

  /**
   * Public submission via magic token. Validates the token then records the
   * response. The schema's SurveyResponse model carries scores in the
   * responses JSON column.
   */
  async submitResponse(surveyId: string, token: string, dto: SubmitSurveyResponseDto) {
    const verified = this.magic.verify(token);
    if (!verified || verified.scope !== 'survey') {
      throw new BadRequestException('Invalid or expired token');
    }
    const survey = await (this.prisma as any).materialitySurvey.findFirst({
      where: { id: surveyId, tenantId: verified.tenantId },
    });
    if (!survey || survey.status !== 'ACTIVE') {
      throw new ConflictException('Survey not active');
    }
    if (!dto.respondentEmail) {
      throw new BadRequestException('respondentEmail is required');
    }
    return (this.prisma as any).surveyResponse.create({
      data: {
        surveyId,
        respondentEmail: dto.respondentEmail,
        respondentRole: dto.respondentName ?? null,
        submittedAt: new Date(),
        responses: { scores: dto.scores, comments: dto.comments ?? null },
      },
    });
  }

  async closeSurvey(tenantId: string, surveyId: string, actorId: string) {
    const survey = await (this.prisma as any).materialitySurvey.findFirst({ where: { id: surveyId, tenantId } });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status === 'CLOSED') return survey;

    const updated = await (this.prisma as any).materialitySurvey.update({
      where: { id: surveyId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MaterialitySurvey',
      entityId: surveyId,
      action: 'UPDATE',
      metadata: { transition: 'closed' },
    });
    return updated;
  }

  // ---- Assessments ----

  async createAssessment(tenantId: string, dto: CreateAssessmentDto, actorId: string) {
    const survey = await (this.prisma as any).materialitySurvey.findFirst({
      where: { id: dto.surveyId, tenantId },
      include: { responses: true },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'CLOSED') {
      throw new BadRequestException('Survey must be CLOSED to run an assessment');
    }

    // Aggregate average importance per topic from the responses JSON.
    const byTopic = new Map<string, { sum: Decimal; count: number }>();
    for (const r of survey.responses ?? []) {
      const scores: { topicId: string; importance: number }[] = (r.responses?.scores as any[]) ?? [];
      for (const s of scores) {
        const e = byTopic.get(s.topicId) ?? { sum: new Decimal(0), count: 0 };
        e.sum = e.sum.plus(s.importance);
        e.count++;
        byTopic.set(s.topicId, e);
      }
    }
    const matrix = Array.from(byTopic.entries()).map(([topicId, v]) => ({
      topicId,
      stakeholderImportance: v.sum.div(v.count || 1).toNumber(),
      businessImpact: 0,
      score: v.sum.div(v.count || 1).toNumber(),
    }));
    matrix.sort((a, b) => b.score - a.score);
    const priorityTopics = matrix.slice(0, 12).map((m) => m.topicId);

    const run = await (this.prisma as any).materialityAssessmentRun.create({
      data: {
        tenantId,
        fy: survey.fy,
        matrixData: matrix,
        priorityTopics,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MaterialityAssessmentRun',
      entityId: run.id,
      action: 'CREATE',
      after: run,
    });
    return run;
  }

  async getAssessment(tenantId: string, id: string) {
    const a = await (this.prisma as any).materialityAssessmentRun.findFirst({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  async signAssessment(tenantId: string, id: string, dto: SignAssessmentDto, actorId: string) {
    const a = await this.getAssessment(tenantId, id);
    if (a.lockedAt) throw new ConflictException('Already signed');
    // Schema columns: boardSignedAt, signedByUserId, signatureEvidenceS3, lockedAt.
    const signed = await (this.prisma as any).materialityAssessmentRun.update({
      where: { id },
      data: {
        boardSignedAt: new Date(),
        signedByUserId: actorId,
        signatureEvidenceS3: dto.evidenceS3Key,
        lockedAt: new Date(),
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MaterialityAssessmentRun',
      entityId: id,
      action: 'SIGN',
      before: a,
      after: signed,
      metadata: { signerName: dto.signerName, signerRole: dto.signerRole, notes: dto.notes },
    });
    return signed;
  }
}

function inferFyLabel(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const a = String(y).slice(-2);
  const b = String(y + 1).slice(-2);
  return `FY${a}-${b}`;
}
