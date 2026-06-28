import type { Framework } from '../enums/framework.js';
import type {
  AssuranceStatus,
  ReportStatus,
} from '../enums/report.js';
import type { CuidId, Iso8601, Sha256 } from './brand.js';

export interface Report {
  id: CuidId;
  tenantId: CuidId;
  fy: string;
  framework: Framework;
  title: string;
  status: ReportStatus;
  version: number;
  parentReportId: CuidId | null;
  reportData: Record<string, unknown>;
  pdfS3: string | null;
  xlsxS3: string | null;
  xbrlS3: string | null;
  docxS3: string | null;
  narrativeOverrides: Record<string, string>;
  generatedBy: CuidId;
  generatedAt: Iso8601;
  approvedBy: CuidId | null;
  filedWithAuthorityAt: Iso8601 | null;
  hashAnchor: Sha256 | null;
}

export interface AssuranceSnapshot {
  id: CuidId;
  tenantId: CuidId;
  fy: string;
  framework: Framework;
  scope: Record<string, unknown>;
  snapshotAt: Iso8601;
  auditorOrgName: string;
  auditorUserIds: string[];
  metricCount: number;
  evidenceCount: number;
  hashAnchor: Sha256;
  parentSnapshotId: CuidId | null;
  status: AssuranceStatus;
  reportS3: string;
  signedByUserId: CuidId | null;
  signedAt: Iso8601 | null;
}
