import type {
  ConsolidationMethod,
  ControlType,
  EntityType,
  OperationalBoundary,
} from '../enums/entity.js';
import type { CuidId, Decimal, Iso8601 } from './brand.js';

export interface EntityNode {
  id: CuidId;
  tenantId: CuidId;
  parentId: CuidId | null;
  // Postgres ltree path, e.g. "root.in.mh.mumbai_plant".
  ltreePath: string;
  type: EntityType;
  name: string;
  code: string;
  consolidationMethod: ConsolidationMethod;
  ownershipPct: Decimal;
  controlType: ControlType;
  operationalBoundary: OperationalBoundary;
  sector: string | null;
  isicCode: string | null;
  country: string;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  employeeCount: number | null;
  revenue: Decimal | null;
  currency: string | null;
  effectiveFrom: Iso8601;
  effectiveTo: Iso8601 | null;
  metadata: Record<string, unknown>;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}
