import type {
  DocStatus,
  DocType,
  ExtractionStatus,
} from '../enums/document.js';
import type { CuidId, Decimal, Iso8601, Sha256 } from './brand.js';

export interface Document {
  id: CuidId;
  tenantId: CuidId;
  scopeNodeId: CuidId;
  s3Bucket: string;
  s3Key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: Sha256;
  docType: DocType;
  classifierConfidence: number | null;
  pageCount: number | null;
  language: string | null;
  ocrApplied: boolean;
  uploadedBy: CuidId;
  uploadedAt: Iso8601;
  status: DocStatus;
  tags: string[];
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

export interface ConfidenceComponents {
  modelLogprob: number;
  crossValidation: number;
  peerZscore: number;
  schemaValidation: number;
  crossSource: number;
}

export interface ExtractionField {
  id: CuidId;
  documentId: CuidId;
  tenantId: CuidId;
  canonicalKey: string;
  valueText: string | null;
  valueNum: Decimal | null;
  unitExtracted: string | null;
  periodStart: Iso8601 | null;
  periodEnd: Iso8601 | null;
  dimensions: Record<string, string | number>;
  sourcePage: number | null;
  sourceBbox: BoundingBox | null;
  sourceRow: number | null;
  sourceCell: string | null;
  rawText: string;
  confidenceComponents: ConfidenceComponents;
  confidenceComposite: number;
  status: ExtractionStatus;
  reviewedBy: CuidId | null;
  reviewedAt: Iso8601 | null;
  overrideReason: string | null;
  createdAt: Iso8601;
}
