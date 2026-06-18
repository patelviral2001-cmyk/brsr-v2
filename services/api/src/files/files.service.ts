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

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function mimeFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

/**
 * Sanitises a user-provided filename before it lands in S3 metadata, audit
 * logs, or download Content-Disposition headers. Strips path separators and
 * dangerous quoting characters; caps length to avoid abuse.
 */
function sanitizeFilename(name: string): string {
  if (!name) return 'file';
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const cleaned = base
    // strip ASCII control chars
    .replace(/[\x00-\x1f\x7f]/g, '')
    // neutralise characters that break HTTP headers / S3 metadata
    .replace(/["'`$<>|;\r\n]/g, '_')
    .trim();
  return cleaned.slice(0, 200) || 'file';
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
    // Some clients (curl without --form-encode, certain HTTP libraries) ship
    // application/octet-stream as a catch-all. Fall back to the file
    // extension so we don't reject legitimate uploads.
    const effectiveMime = ALLOWED_MIME.has(file.mimetype)
      ? file.mimetype
      : mimeFromExtension(file.originalname);
    if (!ALLOWED_MIME.has(effectiveMime)) {
      throw new BadRequestException(
        `Unsupported file. Got mime '${file.mimetype}' for '${file.originalname}'. Allowed: PDF, XLSX, XLS, CSV, PNG, JPG.`,
      );
    }

    const bucket = this.s3.bucketEvidence();
    const safeOriginalName = sanitizeFilename(file.originalname);
    // Use the cleaned extension (alphanumeric only) so we never write a key
    // like 'foo.exe;.pdf' or similar.
    const rawExt = safeOriginalName.split('.').pop()?.toLowerCase() ?? 'bin';
    const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : 'bin';
    const s3Key = `t/${tenantId}/${new Date().toISOString().slice(0, 10)}/${uuidv4()}.${ext}`;
    await this.s3.put({
      bucket,
      key: s3Key,
      body: file.buffer,
      contentType: file.mimetype,
      // S3 metadata values must be ASCII and not contain CR/LF; sanitised name
      // is what travels.
      metadata: { tenantId, uploaderId: actorId, originalName: safeOriginalName },
    });

    // Resolve scope node — validate that the provided one belongs to this
    // tenant, else fall back to the tenant's root/first node. Frontend can
    // ship a stale or mock-data id (from local Zustand state); silently
    // recovering here avoids a P2003 FK violation that the user can't act on.
    let scopeNodeId = dto.scopeNodeId;
    if (scopeNodeId) {
      const ok = await (this.prisma as any).entityNode.findFirst({
        where: { id: scopeNodeId, tenantId },
        select: { id: true },
      });
      if (!ok) {
        this.logger.warn(
          `Provided scopeNodeId ${scopeNodeId} does not belong to tenant ${tenantId} — falling back to default`,
        );
        scopeNodeId = undefined;
      }
    }
    if (!scopeNodeId) {
      const node = await (this.prisma as any).entityNode.findFirst({
        where: { tenantId },
        orderBy: { type: 'asc' }, // GROUP comes first alphabetically
        select: { id: true },
      });
      if (!node) {
        throw new BadRequestException(
          'No entity hierarchy exists for this tenant. Create at least one entity node before uploading documents.',
        );
      }
      scopeNodeId = node.id;
    }

    // Compute a stable content hash for deduplication.
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Validate docType against DocType enum, else fall back to OTHER.
    const docType = normalizeDocType(dto.docType);

    // Idempotent upload: if the same content was already uploaded for this
    // tenant, return the existing record instead of failing with a unique-
    // constraint error.
    const existing = await (this.prisma as any).document.findUnique({
      where: { tenantId_sha256: { tenantId, sha256 } },
    });
    if (existing) {
      this.logger.log(
        `Duplicate upload detected for ${file.originalname} (sha256=${sha256.slice(0, 8)}…); returning existing doc ${existing.id}`,
      );
      existing.sizeBytes = typeof existing.sizeBytes === 'bigint' ? Number(existing.sizeBytes) : existing.sizeBytes;
      return existing;
    }

    let doc: any;
    try {
      doc = await (this.prisma as any).document.create({
        data: {
          tenantId,
          scopeNodeId,
          uploadedBy: actorId,
          originalName: safeOriginalName,
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
    } catch (e: any) {
      // Race condition: another concurrent request inserted between our
      // findUnique and create. Fetch and return the now-existing record.
      if (e?.code === 'P2002') {
        const dup = await (this.prisma as any).document.findUnique({
          where: { tenantId_sha256: { tenantId, sha256 } },
        });
        if (dup) {
          dup.sizeBytes = typeof dup.sizeBytes === 'bigint' ? Number(dup.sizeBytes) : dup.sizeBytes;
          return dup;
        }
      }
      throw e;
    }
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
      metadata: { originalName: safeOriginalName, sizeBytes: file.size, docType: dto.docType },
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
    // Atomic: clear extraction state and reset status in one transaction so
    // a partial failure can't leave the document in an inconsistent state.
    await this.prisma.$transaction(async (tx) => {
      await (tx as any).extractionField.deleteMany({ where: { documentId: id, tenantId } });
      await (tx as any).document.update({
        where: { id },
        // Document model in schema has only DocStatus: PENDING|CLASSIFIED|EXTRACTED|REVIEW_NEEDED|APPROVED|REJECTED.
        // 'UPLOADED' is not a valid status — use PENDING. classifierConfidence
        // (not confidenceComposite) is the schema column; lastError does not
        // exist on Document.
        data: { status: 'PENDING', classifierConfidence: null },
      });
    });
    void this.dispatchExtraction(id, tenantId, doc.s3Key, doc.docType ?? undefined);
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Document',
      entityId: id,
      action: 'EXTRACT',
      metadata: { reprocess: true },
    });
    return { ok: true };
  }

  async signedUrl(tenantId: string, id: string, ttlSeconds = 600): Promise<string> {
    const doc = await this.findOne(tenantId, id);
    // Force browser download (Content-Disposition: attachment) so any
    // attacker-controlled HTML/SVG isn't rendered in the user's session.
    return this.s3.presignGet(
      doc.s3Bucket,
      doc.s3Key,
      ttlSeconds,
      sanitizeFilename(doc.originalName ?? 'document'),
    );
  }

  /**
   * Internal callback from the AI engine. Persists extraction fields, updates
   * document status, and enqueues a post-extraction validation job.
   *
   * Field-name alignment (schema.prisma):
   *   ExtractionField: canonicalKey, valueText/valueNum, unitExtracted,
   *     confidenceComposite, sourcePage, sourceBbox, rawText,
   *     confidenceComponents, status ∈ {DRAFT,NEEDS_REVIEW,APPROVED,REJECTED,OVERRIDDEN}
   *   Document.status ∈ {PENDING,CLASSIFIED,EXTRACTED,REVIEW_NEEDED,APPROVED,REJECTED}
   *   Document has classifierConfidence (not confidenceComposite), no lastError,
   *   no extractedAt.
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
          // 'EXTRACTION_FAILED' isn't in DocStatus enum — REJECTED is the
          // terminal failure state. Reason captured in audit log.
          data: { status: 'REJECTED' },
        });
        return;
      }

      for (const f of dto.fields) {
        const isNumeric = typeof f.value === 'number' || (typeof f.value === 'string' && /^-?\d+(\.\d+)?$/.test(f.value as string));
        await (tx as any).extractionField.create({
          data: {
            tenantId: dto.tenantId,
            documentId: dto.documentId,
            canonicalKey: f.fieldKey,
            valueText: isNumeric ? null : (typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value ?? '')),
            valueNum: isNumeric ? new Decimal(String(f.value)) : null,
            unitExtracted: f.unit,
            sourcePage: f.pageNumber,
            sourceBbox: f.bbox ?? undefined,
            rawText: f.evidenceText ?? '',
            confidenceComponents: { model: f.confidence },
            confidenceComposite: f.confidence,
            // ExtractionStatus enum has no AUTO_ACCEPTED — DRAFT is the
            // post-extract default; NEEDS_REVIEW gates human triage.
            status: f.confidence < 0.85 ? 'NEEDS_REVIEW' : 'DRAFT',
          },
        });
      }
      const composite = dto.documentConfidence ?? avg(dto.fields.map((f) => f.confidence));
      await (tx as any).document.update({
        where: { id: dto.documentId },
        data: {
          status:
            composite < 0.85 || dto.needsReview
              ? 'REVIEW_NEEDED'
              : 'EXTRACTED',
          classifierConfidence: composite,
        },
      });
    });

    await this.validationQueue.add(
      'post-extraction',
      {
        documentId: dto.documentId,
        tenantId: dto.tenantId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    // Best-effort audit; never block the callback on logging.
    try {
      await this.audit.log({
        tenantId: dto.tenantId,
        userId: null,
        entity: 'Document',
        entityId: dto.documentId,
        action: 'EXTRACT',
        metadata: {
          status: dto.status,
          fieldCount: dto.fields.length,
          error: dto.error ?? undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`Audit log skipped for extraction callback: ${(e as Error).message}`);
    }

    return { ok: true };
  }
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
