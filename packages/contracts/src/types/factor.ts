import type { FactorSource, Gas } from '../enums/factor.js';
import type { GwpBasis } from '../enums/framework.js';
import type { CuidId, Decimal, Iso8601 } from './brand.js';

export interface EmissionFactor {
  id: CuidId;
  source: FactorSource;
  // Null tenantId = global factor library; non-null = tenant-overridden factor.
  tenantId: CuidId | null;
  category: string;
  subCategory: string | null;
  activityType: string;
  region: string | null;
  gas: Gas;
  value: Decimal;
  unit: string;
  gwpBasis: GwpBasis | null;
  citation: string;
  validFrom: Iso8601;
  validTo: Iso8601 | null;
  createdAt: Iso8601;
}
