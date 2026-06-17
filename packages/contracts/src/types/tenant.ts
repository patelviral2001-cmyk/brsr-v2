import type {
  DataResidency,
  IsolationTier,
  TenantPlan,
} from '../enums/tenant.js';
import type { CuidId, Iso8601 } from './brand.js';

export interface Tenant {
  id: CuidId;
  name: string;
  slug: string;
  plan: TenantPlan;
  isolationTier: IsolationTier;
  dataResidency: DataResidency;
  brandColor: string | null;
  logoUrl: string | null;
  customDomain: string | null;
  createdAt: Iso8601;
  updatedAt: Iso8601;
  deletedAt: Iso8601 | null;
}

export interface TenantSetting {
  tenantId: CuidId;
  key: string;
  value: unknown;
  updatedAt: Iso8601;
}
