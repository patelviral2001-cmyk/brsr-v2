import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
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
      // The AI engine reaches us inside the docker network; it cannot resolve
      // PUBLIC_BASE_URL from its DNS namespace, and the URI-versioned path is
      // /api/v1/v1/... (global prefix /api/v1 + URI version v1). The shared
      // secret travels via env (INTERNAL_CALLBACK_SECRET on both sides), so we
      // do NOT include it in the body — the AI engine schema forbids extras.
      const internalApiBase = this.config.get<string>('INTERNAL_API_URL') ?? 'http://api:4000';
      const callbackUrl = `${internalApiBase}/api/v1/v1/files/extraction-callback`;
      await firstValueFrom(
        this.http.post(aiUrl, {
          file_id: documentId,
          s3_url: presigned,
          tenant_id: tenantId,
          doc_type_hint: docTypeHint,
          callback_url: callbackUrl,
          callback_secret_header: 'x-internal-secret',
        }),
      );
      await (this.prisma as any).document.update({
        where: { id: documentId },
        data: { status: 'CLASSIFIED' },
      });
    } catch (e) {
      // Capture the response body when present so the operator can see WHY
      // the AI engine rejected the dispatch (axios attaches it on response.data).
      const err = e as { message?: string; response?: { status?: number; data?: unknown } };
      const detail = err.response?.data ? ` body=${JSON.stringify(err.response.data).slice(0, 500)}` : '';
      this.logger.error(
        `Extraction dispatch failed for ${documentId}: ${err.message}${detail}`,
      );
      await (this.prisma as any).document.update({
        where: { id: documentId },
        data: { status: 'REJECTED' },
      });
    }
  }

  // Whitelisted via schema.prisma DocStatus enum. Keep in sync if the schema
  // is extended — an unknown value silently filters to zero rows in Prisma.
  private static readonly DOC_STATUSES = new Set([
    'PENDING','UPLOADED','CLASSIFIED','EXTRACTED','EXTRACTION_FAILED',
    'PARTIAL','NEEDS_REVIEW','REVIEW_NEEDED','APPROVED','REJECTED',
  ]);

  async list(
    tenantId: string,
    q: { docType?: string; status?: string; scopeNodeId?: string; take?: number; skip?: number },
  ) {
    // Clamp pagination so a tenant can't request unbounded scans (DoS).
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const skip = Math.max(0, q.skip ?? 0);
    if (q.status && !FilesService.DOC_STATUSES.has(q.status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${[...FilesService.DOC_STATUSES].join(',')}`,
      );
    }
    return (this.prisma as any).document.findMany({
      where: {
        tenantId,
        ...(q.docType ? { docType: q.docType } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.scopeNodeId ? { scopeNodeId: q.scopeNodeId } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
      take,
      skip,
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
    // We deliberately do NOT presign an S3 URL. The deployed S3 endpoint
    // (http://minio:9000) lives on the internal docker network and is
    // unreachable from the customer's browser. Instead we return a
    // public-base /download URL with a short-lived HMAC access token so
    // iframes / <img> tags can fetch the bytes without an Authorization
    // header. The /download handler proxies the object through this Node
    // process — same content, reachable host.
    const doc = await this.findOne(tenantId, id);
    const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
    const token = this.signFileAccessToken(doc.id, tenantId, exp);
    const base = (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
    const path = `/api/v1/v1/files/${doc.id}/view?access=${token}`;
    return base ? `${base}${path}` : path;
  }

  /** Look up a document by id with no tenant filter — used only by the
   *  /:id/view route, which derives the tenant from the HMAC token's
   *  binding instead of from a JWT principal. */
  async findOneAcrossTenants(id: string) {
    return (this.prisma as any).document.findUnique({ where: { id } });
  }

  /**
   * Issues a short-lived HMAC token that the /download handler accepts in
   * place of a Bearer JWT. Lets browsers stream the file from <iframe src>
   * or <img src> without Authorization headers, while still proving the
   * request was authorised by a logged-in caller within `exp`.
   */
  signFileAccessToken(docId: string, tenantId: string, exp: number): string {
    const secret = this.fileAccessSecret();
    const payload = `${docId}.${tenantId}.${exp}`;
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${exp}.${sig}`;
  }

  /**
   * Returns true iff `token` was produced by signFileAccessToken for the
   * same (docId, tenantId) and has not expired. timingSafeEqual prevents
   * leaking signature comparison time.
   */
  verifyFileAccessToken(token: string, docId: string, tenantId: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot < 1) return false;
    const expStr = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac('sha256', this.fileAccessSecret())
      .update(`${docId}.${tenantId}.${exp}`)
      .digest('base64url');
    if (expected.length !== sig.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  }

  private fileAccessSecret(): string {
    // Reuse INTERNAL_CALLBACK_SECRET as the HMAC key — it's already a
    // 32+ char random secret distinct per environment.
    const s = this.config.get<string>('INTERNAL_CALLBACK_SECRET');
    if (!s) {
      throw new Error('INTERNAL_CALLBACK_SECRET not configured — cannot sign file access tokens');
    }
    return s;
  }

  /**
   * Auth-checked file download — streams the object bytes from MinIO/S3
   * through this Node process. Necessary because the deployed S3_ENDPOINT
   * is `http://minio:9000` (internal docker network) — a presigned URL
   * signed with that host header is unreachable from the customer's
   * browser. The streaming proxy keeps the storage backend private while
   * still giving the browser an attachment download.
   */
  async streamDownload(
    tenantId: string,
    id: string,
    res: any, // Express.Response; typed `any` to avoid pulling Express types here
  ): Promise<void> {
    const doc = await this.findOne(tenantId, id);
    const buf = await this.s3.get(doc.s3Bucket, doc.s3Key);
    const filename = sanitizeFilename(doc.originalName ?? 'document');
    res.setHeader('Content-Type', doc.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buf);
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
        // Period carried by the AI engine when its rule/regex extractors
        // parsed the bill cycle. Stored on the field so the later promote
        // to metric_event has the values it needs without a doc fallback.
        const ps = f.periodStart ? new Date(f.periodStart) : undefined;
        const pe = f.periodEnd ? new Date(f.periodEnd) : undefined;
        await (tx as any).extractionField.create({
          data: {
            tenantId: dto.tenantId,
            documentId: dto.documentId,
            canonicalKey: f.fieldKey,
            valueText: isNumeric ? null : (typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value ?? '')),
            valueNum: isNumeric ? new Decimal(String(f.value)) : null,
            unitExtracted: f.unit,
            periodStart: ps && !Number.isNaN(ps.getTime()) ? ps : undefined,
            periodEnd: pe && !Number.isNaN(pe.getTime()) ? pe : undefined,
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
      // Build the partial update so we only touch columns whose new value
      // we actually have. docType/ocrApplied arrived in the callback after
      // Module 6 — older AI-engine images that don't send them must not
      // erase the existing row state.
      const data: Record<string, unknown> = {
        status:
          composite < 0.85 || dto.needsReview
            ? 'REVIEW_NEEDED'
            : 'EXTRACTED',
        classifierConfidence: composite,
      };
      if (dto.docType) {
        const docType = normalizeDocType(dto.docType);
        // Only overwrite when the classifier returned a non-OTHER guess —
        // an OTHER reading is the engine saying "I don't know", which
        // shouldn't clobber a user-chosen docType from upload time.
        if (docType !== 'OTHER') {
          data.docType = docType;
        }
      }
      if (typeof dto.ocrApplied === 'boolean') {
        data.ocrApplied = dto.ocrApplied;
      }
      await (tx as any).document.update({
        where: { id: dto.documentId },
        data,
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
