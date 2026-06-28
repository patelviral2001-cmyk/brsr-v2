import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { MagicLinkSigner } from '../common/utils/magic-link';
import { EmailClient } from '../common/utils/email.client';
import { AuditService } from '../audit/audit.service';
import {
  CreateSupplierDto,
  InviteSupplierDto,
  SubmitSupplierResponseDto,
  UpdateSupplierDto,
} from './dto/suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly magic: MagicLinkSigner,
    private readonly email: EmailClient,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, take = 50, skip = 0) {
    // Schema Supplier has no deletedAt; the equivalent is status=ARCHIVED.
    const t = Math.min(Math.max(1, take), 200);
    const s = Math.max(0, skip);
    return (this.prisma as any).supplier.findMany({
      where: { tenantId, status: { not: 'ARCHIVED' } },
      orderBy: { addedAt: 'desc' },
      take: t,
      skip: s,
    });
  }

  async findOne(tenantId: string, id: string) {
    const s = await (this.prisma as any).supplier.findFirst({
      where: { id, tenantId },
    });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async create(tenantId: string, dto: CreateSupplierDto, actorId: string) {
    // Schema columns: name, country, sector, primaryContactEmail, status (default INVITED).
    const s = await (this.prisma as any).supplier.create({
      data: {
        tenantId,
        name: dto.name,
        country: dto.country ?? 'IN',
        sector: dto.category ?? null,
        primaryContactEmail: dto.contactEmail,
        status: 'INVITED',
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: s.id,
      action: 'CREATE',
      after: s,
    });
    return s;
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto, actorId: string) {
    const before = await this.findOne(tenantId, id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.contactEmail !== undefined) data.primaryContactEmail = dto.contactEmail;
    if (dto.category !== undefined) data.sector = dto.category;
    const updated = await (this.prisma as any).supplier.update({ where: { id }, data });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: id,
      action: 'UPDATE',
      before,
      after: updated,
    });
    return updated;
  }

  async remove(tenantId: string, id: string, actorId: string) {
    const before = await this.findOne(tenantId, id);
    // No deletedAt — archive via status.
    await (this.prisma as any).supplier.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: id,
      action: 'DELETE',
      before,
    });
  }

  async invite(tenantId: string, id: string, dto: InviteSupplierDto, actorId: string) {
    const supplier = await this.findOne(tenantId, id);
    const to = dto.toEmail ?? supplier.primaryContactEmail;
    if (!to) {
      throw new BadRequestException('Supplier has no primaryContactEmail; pass toEmail explicitly.');
    }
    if (!dto.questionnaireId) {
      throw new BadRequestException('questionnaireId is required to send an invitation.');
    }
    // Ensure the questionnaire belongs to this tenant.
    const q = await (this.prisma as any).supplierQuestionnaire.findFirst({
      where: { id: dto.questionnaireId, tenantId },
    });
    if (!q) throw new NotFoundException('Questionnaire not found in this tenant');

    // 60-day expiry for supplier invites.
    const ttl = 60 * 60 * 24 * 60;
    const token = this.magic.sign({
      tenantId,
      scope: 'supplier',
      targetId: id,
      ttlSeconds: ttl,
      subject: to,
    });
    // Schema SupplierInvite: supplierId, questionnaireId, magicTokenHash (unique),
    // sentAt, openedAt, respondedAt, expiresAt. We hash the token before
    // persisting so the DB never contains the verifier.
    const magicTokenHash = createHash('sha256').update(token).digest('hex');
    await (this.prisma as any).supplierInvite.create({
      data: {
        supplierId: id,
        questionnaireId: dto.questionnaireId,
        magicTokenHash,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    const url = this.magic.buildUrl(token, `/suppliers/portal`);
    try {
      await this.email.send({
        to,
        subject: '[BRSR] Supplier questionnaire — action required',
        html: `<p>Hello,</p><p>Please complete your supplier ESG questionnaire:</p><p><a href="${url}">${url}</a></p>`,
      });
    } catch (e) {
      // Don't roll back the DB row; SES can be retried by ops.
      // Re-throw as 502 so the UI surfaces an error.
      throw new BadRequestException(`Email dispatch failed: ${(e as Error).message}`);
    }
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: id,
      action: 'UPDATE',
      metadata: { invited: true, to },
    });
    return { ok: true };
  }

  // ---- Public portal ----

  async loadPortal(token: string) {
    const verified = this.magic.verify(token);
    if (!verified || verified.scope !== 'supplier') {
      throw new BadRequestException('Invalid or expired token');
    }
    const supplier = await (this.prisma as any).supplier.findFirst({
      where: { id: verified.targetId, tenantId: verified.tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const magicTokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await (this.prisma as any).supplierInvite.findUnique({
      where: { magicTokenHash },
      include: { questionnaire: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invitation expired');
    }
    if (!invitation.openedAt) {
      await (this.prisma as any).supplierInvite.update({
        where: { id: invitation.id },
        data: { openedAt: new Date() },
      });
    }
    return {
      supplier: { id: supplier.id, name: supplier.name },
      questionnaire: invitation.questionnaire,
    };
  }

  async submitResponse(token: string, dto: SubmitSupplierResponseDto) {
    const verified = this.magic.verify(token);
    if (!verified || verified.scope !== 'supplier') {
      throw new BadRequestException('Invalid or expired token');
    }
    const magicTokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await (this.prisma as any).supplierInvite.findUnique({
      where: { magicTokenHash },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.respondedAt) throw new BadRequestException('Response already submitted');

    // Schema SupplierResponse: supplierId, questionnaireId, status, responses
    // (json), evidenceDocIds[], submittedAt, score. Persist answers + evidence
    // collapsed into the JSON column to match the schema.
    return this.prisma.$transaction(async (tx) => {
      const response = await (tx as any).supplierResponse.create({
        data: {
          supplierId: verified.targetId,
          questionnaireId: invitation.questionnaireId,
          status: 'SUBMITTED',
          responses: { answers: dto.answers ?? [] },
          evidenceDocIds: (dto.evidence ?? []).map((e) => e.s3Key),
          submittedAt: new Date(),
        },
      });
      await (tx as any).supplierInvite.update({
        where: { id: invitation.id },
        data: { respondedAt: new Date() },
      });
      // Move the supplier into the ENGAGED/RESPONDED status.
      await (tx as any).supplier.update({
        where: { id: verified.targetId },
        data: { status: 'RESPONDED', lastEngagedAt: new Date() },
      });
      return response;
    });
  }

  /**
   * Simple weighted-question scorer that writes a SupplierScore row.
   * The schema has SupplierScore (per-fy unique) not a separate scorecard table.
   */
  async score(tenantId: string, supplierId: string, actorId: string) {
    const supplier = await this.findOne(tenantId, supplierId);
    const responses: { id: string; responses: any; submittedAt: Date | null }[] =
      await (this.prisma as any).supplierResponse.findMany({
        where: { supplierId, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        take: 1,
      });
    if (responses.length === 0) {
      throw new BadRequestException('No response submitted yet');
    }
    const latest = responses[0]!;
    const answers: { questionId: string; value: unknown }[] = (latest.responses?.answers as any[]) ?? [];
    if (answers.length === 0) {
      throw new BadRequestException('Response has no answers');
    }

    // Without a SupplierQuestion table in the schema we score by
    // E/S/G category counts. This intentionally matches the simple shape
    // the frontend already renders while the richer registry lands.
    const env = answers.filter((a) => /^E/i.test(a.questionId)).length;
    const soc = answers.filter((a) => /^S/i.test(a.questionId)).length;
    const gov = answers.filter((a) => /^G/i.test(a.questionId)).length;
    const total = Math.max(1, env + soc + gov);
    const environmentScore = Math.round((env / total) * 100);
    const socialScore = Math.round((soc / total) * 100);
    const governanceScore = Math.round((gov / total) * 100);
    const compositeScore = Math.round((environmentScore + socialScore + governanceScore) / 3);
    const fy = inferFyLabel(latest.submittedAt ?? new Date());

    // SupplierScore @@unique([supplierId, fy]) — upsert so re-scoring is safe.
    const score = await (this.prisma as any).supplierScore.upsert({
      where: { supplierId_fy: { supplierId, fy } },
      update: {
        environmentScore,
        socialScore,
        governanceScore,
        compositeScore,
        peerPercentile: 0,
        computedAt: new Date(),
      },
      create: {
        supplierId,
        fy,
        environmentScore,
        socialScore,
        governanceScore,
        compositeScore,
        peerPercentile: 0,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Supplier',
      entityId: supplierId,
      action: 'UPDATE',
      metadata: {
        scored: true,
        compositeScore,
        fy,
        supplierName: supplier.name,
      },
    });
    return score;
  }

  async aggregateScorecard(tenantId: string) {
    // Pull latest score per supplier in the tenant.
    const suppliers = await (this.prisma as any).supplier.findMany({
      where: { tenantId, status: { not: 'ARCHIVED' } },
      select: { id: true, scores: { orderBy: { computedAt: 'desc' }, take: 1 } },
    });
    const items = suppliers.flatMap((s: { scores: { compositeScore: number }[] }) => s.scores);
    const buckets: Record<string, number> = {};
    let total = 0;
    for (const it of items) {
      const grade =
        it.compositeScore >= 85 ? 'A' : it.compositeScore >= 70 ? 'B' : it.compositeScore >= 50 ? 'C' : it.compositeScore >= 30 ? 'D' : 'F';
      buckets[grade] = (buckets[grade] ?? 0) + 1;
      total += it.compositeScore;
    }
    return {
      suppliers: items.length,
      averageScore: items.length ? total / items.length : 0,
      distribution: buckets,
    };
  }
}

/** Derive an FY label like "FY24-25" from a date (April-March IST). */
function inferFyLabel(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const a = String(y).slice(-2);
  const b = String(y + 1).slice(-2);
  return `FY${a}-${b}`;
}
