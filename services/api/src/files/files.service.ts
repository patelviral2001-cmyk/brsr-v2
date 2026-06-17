import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { S3Storage } from '../common/utils/s3.client';
import { AuditService } from '../audit/audit.service';
import { ExtractionCallbackDto, UploadFileDto } from './dto/files.dto';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'image/png',
  'image/jpeg',
]);
const MAX_BYTES = 50 * 1024 * 1024;

// Whitelist of DocType enum values (matches schema.prisma).
const KNOWN_DOC_TYPES = new Set([
  'UTILITY_BILL', 'FUEL_INVOICE', 'ELECTRICITY_BILL', 'WATER_BILL',
  'WASTE_MANIFEST', 'HR_SHEET', 'PAYROLL', 'SAFETY_INCIDENT',
  'AUDITED_FINANCIALS', 'GRI_INDEX', 'BRSR_DRAFT', 'POLICY_DOC',
  'BOARD_MINUTES', 'CERTIFICATE', 'SUPPLIER_RESPONSE',
  'EMISSIONS_INVENTORY', 'OTHER',
]);

function normalizeDocType(docType?: string): string {
  if (!docType) return 'OTHER';
  const up = docType.toUpperCase();
  return KNOWN_DOC_TYPES.has(up) ? up : 'OTHER';
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Storage,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @InjectQueue('extraction-validation') private readonly validationQueue: Queue,
  ) {}

  async upload(
    tenantId: string,
    actorId: string,
    file: Express.Multer.File,
    dto: UploadFileDto,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File exceeds 50MB limit (${file.size} bytes)`);
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported mime type: ${file.mimetype}`);
    }

    const bucket = this.s3.bucketEvidence();
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    const s3Key = `t/${tenantId}/${new Date().toISOString().slice(0, 10)}/${uuidv4()}.${ext}`;
    await this.s3.put({
      bucket,
      key: s3Key,
      body: file.buffer,
      contentType: file.mimetype,
      metadata: { tenantId, uploaderId: actorId, originalName: file.originalname },
    });

    // Resolve scope node — use provided one, else first node for the tenant.
    let scopeNodeId = dto.scopeNodeId;
    if (!scopeNodeId) {
      const node = await (this.prisma as any).entityNode.findFirst({
        where: { tenantId },
        select: { id: true },
      });
      if (!node) {
        throw new BadRequestException(
          'No scopeNodeId provided and no entity node exists for this tenant',
        );
      }
      scopeNodeId = node.id;
    }

    // Compute a stable content hash for deduplication.
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Validate docType against DocType enum, else fall back to GENERIC.
    const docType = normalizeDocType(dto.docType);

    const doc = await (this.prisma as any).document.create({
      data: {
        tenantId,
        scopeNodeId,
        uploadedBy: actorId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256,
        s3Bucket: bucket,
        s3Key,
        docType,
        status: 'PENDING',
        tags: dto.tags?.split(',').map((t) => t.trim()).filter(Boolean) ?? [],
      },
    });
    // Coerce BigInt fields so JSON serialization doesn't fail.
    doc.sizeBytes = typeof doc.sizeBytes === 'bigint' ? Number(doc.sizeBytes) : doc.sizeBytes;

    // Fire-and-forget dispatch to AI engine.
    void this.dispatchExtraction(doc.id, tenantId, s3Key, dto.docType);

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Document',
      entityId: doc.id,
      action: 'upload',
      metadata: { originalName: file.originalname, sizeBytes: file.size, docType: dto.docType },
    });
    return doc;
  }

  private async dispatchExtraction(
    documentId: string,
    tenantId: string,
    s3Key: string,
    docTypeHint: string | undefined,
  ) {
    try {
      const aiUrl = `${this.config.get<string>('AI_ENGINE_URL')}/extract`;
      const presigned = await this.s3.presignGet(this.s3.bucketEvidence(), s3Key, 60 * 60);
      await firstValueFrom(
        this.http.post(aiUrl, {
          file_id: documentId,
          s3_url: presigned,
          tenant_id: tenantId,
          doc_type_hint: docTypeHint,
          callback_url: this.config.get<string>('PUBLIC_BASE_URL') + '/api/v1/files/extraction-callback',
          callback_secret: this.config.get<string>('INTERNAL_CALLBACK_SECRET'),
        }),
      );
      await (this.prisma as any).document.update({
        where: { id: documentId },
        data: { status: 'CLASSIFIED' },
      });
    } catch (e) {
      this.logger.error(`Extraction dispatch failed for ${documentId}: ${(e as Error).message}`);
      await (this.prisma as any).document.update({
        where: { id: documentId },
        data: { status: 'REJECTED' },
      });
    }
  }

  async list(
    tenantId: string,
    q: { docType?: string; status?: string; scopeNodeId?: string; take?: number; skip?: number },
  ) {
    return (this.prisma as any).document.findMany({
      where: {
        tenantId,
        ...(q.docType ? { docType: q.docType } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.scopeNodeId ? { scopeNodeId: q.scopeNodeId } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
      take: q.take ?? 50,
      skip: q.skip ?? 0,
    });
  }

  async findOne(tenantId: string, id: string) {
    const doc = await (this.prisma as any).document.findFirst({
      where: { id, tenantId },
      include: { extractionFields: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async softDelete(tenantId: string, id: string, actorId: string) {
    const doc = await this.findOne(tenantId, id);
    // Document model has no `deletedAt` — just flip status.
    await (this.prisma as any).document.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Document',
      entityId: id,
      action: 'delete',
      before: doc,
    });
  }

  async reprocess(tenantId: string, id: string, actorId: string) {
    const doc = await this.findOne(tenantId, id);
    await (this.prisma as any).extractionField.deleteMany({ where: { documentId: id } });
    await (this.prisma as any).document.update({
      where: { id },
      data: { status: 'UPLOADED', confidenceComposite: null, lastError: null },
    });
    void this.dispatchExtraction(id, tenantId, doc.s3Key, doc.docType ?? undefined);
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Document',
      entityId: id,
      action: 'reprocess',
    });
    return { ok: true };
  }

  async signedUrl(tenantId: string, id: string, ttlSeconds = 600): Promise<string> {
    const doc = await this.findOne(tenantId, id);
    return this.s3.presignGet(doc.s3Bucket, doc.s3Key, ttlSeconds);
  }

  /**
   * Internal callback from the AI engine. Persists extraction fields, updates
   * document status, and enqueues a post-extraction validation job.
   */
  async handleExtractionCallback(dto: ExtractionCallbackDto) {
    const doc = await (this.prisma as any).document.findFirst({
      where: { id: dto.documentId, tenantId: dto.tenantId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    await this.prisma.$transaction(async (tx) => {
      if (dto.status === 'FAILED') {
        await (tx as any).document.update({
          where: { id: dto.documentId },
          data: { status: 'EXTRACTION_FAILED', lastError: dto.error ?? 'unknown', extractedAt: new Date() },
        });
        return;
      }

      for (const f of dto.fields) {
        await (tx as any).extractionField.create({
          data: {
            tenantId: dto.tenantId,
            documentId: dto.documentId,
            fieldKey: f.fieldKey,
            value: typeof f.value === 'object' ? f.value : { v: f.value },
            unit: f.unit,
            confidence: new Decimal(f.confidence),
            pageNumber: f.pageNumber,
            bbox: f.bbox ?? [],
            evidenceText: f.evidenceText,
            status: f.confidence < 0.85 ? 'NEEDS_REVIEW' : 'AUTO_ACCEPTED',
          },
        });
      }
      const composite = dto.documentConfidence ?? avg(dto.fields.map((f) => f.confidence));
      await (tx as any).document.update({
        where: { id: dto.documentId },
        data: {
          status:
            dto.status === 'PARTIAL'
              ? 'PARTIAL'
              : composite < 0.85 || dto.needsReview
                ? 'NEEDS_REVIEW'
                : 'EXTRACTED',
          confidenceComposite: new Decimal(composite),
          extractedAt: new Date(),
        },
      });
    });

    await this.validationQueue.add('post-extraction', {
      documentId: dto.documentId,
      tenantId: dto.tenantId,
    });
  }
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
