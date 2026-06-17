import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class MaterialityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly magic: MagicLinkSigner,
    private readonly email: EmailClient,
  ) {}

  // ---- Topics ----

  async listTopics(tenantId: string) {
    return (this.prisma as any).materialityTopic.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  async createTopic(tenantId: string, dto: CreateTopicDto, actorId: string) {
    const topic = await (this.prisma as any).materialityTopic.create({
      data: { ...dto, tenantId },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'MaterialityTopic',
      entityId: topic.id,
      action: 'create',
      after: topic,
    });
    return topic;
  }

  // ---- Stakeholders ----

  async listStakeholders(tenantId: string) {
    return (this.prisma as any).stakeholder.findMany({ where: { tenantId }, orderBy: { group: 'asc' } });
  }

  async createStakeholder(tenantId: string, dto: CreateStakeholderDto, actorId: string) {
    const s = await (this.prisma as any).stakeholder.create({ data: { ...dto, tenantId } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Stakeholder',
      entityId: s.id,
      action: 'create',
      after: s,
    });
    return s;
  }

  // ---- Surveys ----

  async createSurvey(tenantId: string, dto: CreateSurveyDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const survey = await (tx as any).survey.create({
        data: {
          tenantId,
          name: dto.name,
          status: SurveyStatus.DRAFT,
          opensAt: dto.opensAt ? new Date(dto.opensAt) : null,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
          topics: { connect: dto.topicIds.map((id) => ({ id })) },
        },
      });
      for (const stakeholderId of dto.stakeholderIds) {
        await (tx as any).surveyInvitation.create({
          data: { tenantId, surveyId: survey.id, stakeholderId },
        });
      }
      await this.audit.log({
        tenantId,
        userId: actorId,
        entity: 'Survey',
        entityId: survey.id,
        action: 'create',
        after: survey,
      });
      return survey;
    });
  }

  async launchSurvey(tenantId: string, surveyId: string, actorId: string) {
    const survey = await (this.prisma as any).survey.findFirst({
      where: { id: surveyId, tenantId },
      include: { invitations: { include: { stakeholder: true } } },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== SurveyStatus.DRAFT) {
      throw new ConflictException(`Cannot launch survey in status ${survey.status}`);
    }

    const sent: string[] = [];
    for (const inv of survey.invitations) {
      const token = this.magic.sign({
        tenantId,
        scope: 'survey',
        targetId: inv.id,
        ttlSeconds: 60 * 60 * 24 * 30,
        subject: inv.stakeholder?.email,
      });
      const url = this.magic.buildUrl(token, `/materiality/survey/${surveyId}`);
      await (this.prisma as any).surveyInvitation.update({
        where: { id: inv.id },
        data: { magicToken: token, sentAt: new Date() },
      });
      if (inv.stakeholder?.email) {
        await this.email.send({
          to: inv.stakeholder.email,
          subject: `[BRSR] You're invited to the materiality survey — ${survey.name}`,
          html: `<p>Hello ${inv.stakeholder.name},</p><p>Please complete the materiality survey:</p><p><a href="${url}">${url}</a></p>`,
        });
        sent.push(inv.stakeholder.email);
      }
    }

    const updated = await (this.prisma as any).survey.update({
      where: { id: surveyId },
      data: { status: SurveyStatus.ACTIVE, launchedAt: new Date() },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Survey',
      entityId: surveyId,
      action: 'launch',
      metadata: { sentEmails: sent.length },
    });
    return updated;
  }

  /**
   * Public submission via magic token. Validates token → invitation, marks
   * the invitation completed, persists the response.
   */
  async submitResponse(surveyId: string, token: string, dto: SubmitSurveyResponseDto) {
    const verified = this.magic.verify(token);
    if (!verified || verified.scope !== 'survey') {
      throw new BadRequestException('Invalid or expired token');
    }
    const invitation = await (this.prisma as any).surveyInvitation.findFirst({
      where: { id: verified.targetId, tenantId: verified.tenantId, surveyId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.completedAt) throw new ConflictException('Response already submitted');

    const survey = await (this.prisma as any).survey.findFirst({
      where: { id: surveyId, tenantId: verified.tenantId },
    });
    if (!survey || survey.status !== SurveyStatus.ACTIVE) {
      throw new ConflictException('Survey not active');
    }

    return this.prisma.$transaction(async (tx) => {
      const response = await (tx as any).surveyResponse.create({
        data: {
          tenantId: verified.tenantId,
          surveyId,
          invitationId: invitation.id,
          respondentName: dto.respondentName,
          respondentEmail: dto.respondentEmail,
          comments: dto.comments,
          scores: {
            createMany: {
              data: dto.scores.map((s) => ({
                tenantId: verified.tenantId,
                topicId: s.topicId,
                importance: s.importance,
              })),
            },
          },
        },
      });
      await (tx as any).surveyInvitation.update({
        where: { id: invitation.id },
        data: { completedAt: new Date() },
      });
      return response;
    });
  }

  async closeSurvey(tenantId: string, surveyId: string, actorId: string) {
    const survey = await (this.prisma as any).survey.findFirst({ where: { id: surveyId, tenantId } });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status === SurveyStatus.CLOSED) return survey;

    const aggregates = await this.computeAggregates(tenantId, surveyId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).survey.update({
        where: { id: surveyId },
        data: { status: SurveyStatus.CLOSED, closedAt: new Date(), aggregates },
      });
      await this.audit.log({
        tenantId,
        userId: actorId,
        entity: 'Survey',
        entityId: surveyId,
        action: 'close',
        after: updated,
      });
      return updated;
    });
  }

  /** Mean importance + response count per topic, returned as a flat array. */
  private async computeAggregates(tenantId: string, surveyId: string) {
    const rows: { topicId: string; importance: number }[] = await (this.prisma as any).surveyScore.findMany({
      where: { tenantId, response: { surveyId } },
      select: { topicId: true, importance: true },
    });
    const byTopic = new Map<string, { sum: Decimal; count: number }>();
    for (const r of rows) {
      const entry = byTopic.get(r.topicId) ?? { sum: new Decimal(0), count: 0 };
      entry.sum = entry.sum.plus(r.importance);
      entry.count += 1;
      byTopic.set(r.topicId, entry);
    }
    return Array.from(byTopic.entries()).map(([topicId, v]) => ({
      topicId,
      mean: v.sum.div(v.count || 1).toNumber(),
      responses: v.count,
    }));
  }

  // ---- Assessments ----

  async createAssessment(tenantId: string, dto: CreateAssessmentDto, actorId: string) {
    const survey = await (this.prisma as any).survey.findFirst({
      where: { id: dto.surveyId, tenantId },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== SurveyStatus.CLOSED) {
      throw new BadRequestException('Survey must be CLOSED to run an assessment');
    }

    const stakeholderAgg = (survey.aggregates as { topicId: string; mean: number }[] | null) ?? [];

    // Internal "business impact" scores — for now copy from the latest internal
    // workshop saved on the topic. Real impl might pull from another table.
    const topics = await (this.prisma as any).materialityTopic.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
    });

    const matrix = topics
      .map((t: { id: string; businessImpact?: number | null }) => {
        const agg = stakeholderAgg.find((s) => s.topicId === t.id);
        if (!agg) return null;
        return {
          topicId: t.id,
          stakeholderImportance: agg.mean,
          businessImpact: t.businessImpact ?? 0,
          score: (agg.mean + (t.businessImpact ?? 0)) / 2,
        };
      })
      .filter(Boolean) as Array<{
      topicId: string;
      stakeholderImportance: number;
      businessImpact: number;
      score: number;
    }>;

    matrix.sort((a, b) => b.score - a.score);
    const priorityTopics = matrix.slice(0, 12).map((m) => m.topicId);

    const run = await (this.prisma as any).assessmentRun.create({
      data: {
        tenantId,
        surveyId: survey.id,
        name: dto.name,
        matrix,
        priorityTopics,
        status: 'OPEN',
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AssessmentRun',
      entityId: run.id,
      action: 'create',
      after: run,
    });
    return run;
  }

  async getAssessment(tenantId: string, id: string) {
    const a = await (this.prisma as any).assessmentRun.findFirst({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  async signAssessment(tenantId: string, id: string, dto: SignAssessmentDto, actorId: string) {
    const a = await this.getAssessment(tenantId, id);
    if (a.status === 'SIGNED') throw new ConflictException('Already signed');
    const signed = await (this.prisma as any).assessmentRun.update({
      where: { id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signerName: dto.signerName,
        signerRole: dto.signerRole,
        signEvidenceS3Key: dto.evidenceS3Key,
        signNotes: dto.notes,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'AssessmentRun',
      entityId: id,
      action: 'sign',
      before: a,
      after: signed,
    });
    return signed;
  }
}
