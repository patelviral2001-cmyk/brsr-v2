import type { Framework } from '../enums/framework.js';
import type {
  SupplierResponseStatus,
  SupplierStatus,
} from '../enums/supplier.js';
import type { CuidId, Decimal, Iso8601 } from './brand.js';

export interface Supplier {
  id: CuidId;
  tenantId: CuidId;
  name: string;
  country: string;
  sector: string | null;
  isicCode: string | null;
  spendInr: Decimal;
  primaryContactEmail: string;
  primaryContactName: string;
  status: SupplierStatus;
  addedAt: Iso8601;
  lastEngagedAt: Iso8601 | null;
}

export type SupplierQuestionType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'FILE';

export interface SupplierQuestion {
  id: string;
  canonicalKey?: string;
  prompt: string;
  type: SupplierQuestionType;
  required: boolean;
  options?: string[];
  unit?: string;
}

export interface SupplierQuestionnaireSection {
  id: string;
  title: string;
  framework?: Framework;
  frameworkRef?: string;
  questions: SupplierQuestion[];
}

export interface SupplierQuestionnaire {
  id: CuidId;
  tenantId: CuidId;
  templateName: string;
  sections: SupplierQuestionnaireSection[];
  createdBy: CuidId;
  createdAt: Iso8601;
  version: number;
}

export interface SupplierResponse {
  id: CuidId;
  supplierId: CuidId;
  questionnaireId: CuidId;
  status: SupplierResponseStatus;
  // Keyed by SupplierQuestion.id; value shape depends on question type.
  responses: Record<string, unknown>;
  evidenceDocIds: string[];
  submittedAt: Iso8601 | null;
  score: number | null;
}

export interface SupplierScore {
  id: CuidId;
  supplierId: CuidId;
  fy: string;
  environmentScore: number;
  socialScore: number;
  governanceScore: number;
  compositeScore: number;
  peerPercentile: number;
  computedAt: Iso8601;
}
