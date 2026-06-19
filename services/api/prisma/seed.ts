/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BRSR Platform v2 — comprehensive demo seed
 *
 * Boots a realistic Imagine Powertree Group tenant so the UI looks
 * alive on first launch: 1 tenant, 7-node hierarchy, 4 roles, 5 users,
 * 30+ canonical metrics, 30+ framework mappings, 50+ emission factors
 * (CEA v18 India grid, DEFRA 2024, IPCC AR6 GWPs), 2 approval workflows,
 * a materiality assessment, and 3 stakeholder groups.
 *
 * Idempotent — every section uses upsert with a stable unique key.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SLUG = 'imagine-powertree';
const FY = 'FY2024-25';
const VALID_FROM_2018 = new Date('2018-01-01T00:00:00.000Z');
const CEA_VALID_FROM = new Date('2023-04-01T00:00:00.000Z');
const DEFRA_VALID_FROM = new Date('2024-06-01T00:00:00.000Z');

// =====================================================================
// HELPERS
// =====================================================================

function dec(v: number | string): Prisma.Decimal {
  return new Prisma.Decimal(v);
}

// =====================================================================
// 1) TENANT
// =====================================================================

async function seedTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      name: 'Imagine Powertree Group',
      slug: TENANT_SLUG,
      plan: 'GROUP',
      isolationTier: 'SILO',
      dataResidency: 'IN',
      brandColor: '#0B7A4B',
      logoUrl: 'https://cdn.brsr.example.com/tenants/imagine-powertree/logo.svg',
      customDomain: 'esg.imaginepowertree.example',
    },
  });

  // A couple of tenant settings to drive UI defaults.
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'reporting.fy_start_month' } },
    update: { value: 4 as any },
    create: { tenantId: tenant.id, key: 'reporting.fy_start_month', value: 4 as any },
  });
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'reporting.default_currency' } },
    update: { value: 'INR' as any },
    create: { tenantId: tenant.id, key: 'reporting.default_currency', value: 'INR' as any },
  });
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'emissions.default_gwp_basis' } },
    update: { value: 'AR6_100Y' as any },
    create: { tenantId: tenant.id, key: 'emissions.default_gwp_basis', value: 'AR6_100Y' as any },
  });

  console.log(`tenant ready: ${tenant.id} (${tenant.slug})`);
  return tenant;
}

// =====================================================================
// 2) ENTITY HIERARCHY
// Build the ltree path as dot-separated lowercase labels.
// Real ltree type is enforced in the migration; from the app's view it's
// just a string column.
// =====================================================================

interface HierarchyNode {
  code: string;
  name: string;
  type: 'GROUP' | 'LEGAL_ENTITY' | 'SITE';
  parentCode: string | null;
  ltreePath: string;
  consolidationMethod: 'FULL' | 'PROPORTIONAL' | 'EQUITY' | 'NOT_CONSOLIDATED';
  ownershipPct: number;
  controlType: 'FINANCIAL' | 'OPERATIONAL' | 'EQUITY';
  operationalBoundary: 'FINANCIAL_CONTROL' | 'OPERATIONAL_CONTROL' | 'EQUITY_SHARE';
  sector?: string;
  isicCode?: string;
  country: string;
  state?: string;
  city?: string;
  lat?: number;
  lng?: number;
  employeeCount?: number;
  revenue?: number;
  currency?: string;
}

const HIERARCHY: HierarchyNode[] = [
  {
    code: 'GRP',
    name: 'Imagine Powertree Group',
    type: 'GROUP',
    parentCode: null,
    ltreePath: 'grp',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'FINANCIAL',
    operationalBoundary: 'FINANCIAL_CONTROL',
    country: 'IN',
    employeeCount: 4820,
    revenue: 38_500_000_000,
    currency: 'INR',
  },
  {
    code: 'IPIL',
    name: 'Imagine Powertree India Ltd.',
    type: 'LEGAL_ENTITY',
    parentCode: 'GRP',
    ltreePath: 'grp.ipil',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'FINANCIAL',
    operationalBoundary: 'FINANCIAL_CONTROL',
    sector: 'Diversified Renewables',
    isicCode: '3510',
    country: 'IN',
    state: 'KA',
    city: 'Bengaluru',
    employeeCount: 2950,
    revenue: 24_200_000_000,
    currency: 'INR',
  },
  {
    code: 'IPIL-BLR-HQ',
    name: 'Bengaluru HQ Campus',
    type: 'SITE',
    parentCode: 'IPIL',
    ltreePath: 'grp.ipil.blr_hq',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'OPERATIONAL',
    operationalBoundary: 'OPERATIONAL_CONTROL',
    sector: 'IT/Services',
    country: 'IN',
    state: 'KA',
    city: 'Bengaluru',
    lat: 12.97,
    lng: 77.59,
    employeeCount: 1180,
  },
  {
    code: 'IPIL-TN-SOL',
    name: 'Tamil Nadu Solar Plant',
    type: 'SITE',
    parentCode: 'IPIL',
    ltreePath: 'grp.ipil.tn_sol',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'OPERATIONAL',
    operationalBoundary: 'OPERATIONAL_CONTROL',
    sector: 'Renewable Generation',
    country: 'IN',
    state: 'TN',
    city: 'Tirunelveli',
    lat: 11.12,
    lng: 78.65,
    employeeCount: 240,
  },
  {
    code: 'IPIL-KA-WIN',
    name: 'Karnataka Wind Farm',
    type: 'SITE',
    parentCode: 'IPIL',
    ltreePath: 'grp.ipil.ka_win',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'OPERATIONAL',
    operationalBoundary: 'OPERATIONAL_CONTROL',
    sector: 'Renewable Generation',
    country: 'IN',
    state: 'KA',
    city: 'Chitradurga',
    lat: 14.67,
    lng: 75.92,
    employeeCount: 110,
  },
  {
    code: 'IPRPL',
    name: 'Imagine Powertree Renewables Pvt Ltd.',
    type: 'LEGAL_ENTITY',
    parentCode: 'GRP',
    ltreePath: 'grp.iprpl',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'FINANCIAL',
    operationalBoundary: 'FINANCIAL_CONTROL',
    sector: 'Solar + Wind Generation',
    isicCode: '3510',
    country: 'IN',
    state: 'MH',
    city: 'Mumbai',
    employeeCount: 1870,
    revenue: 14_300_000_000,
    currency: 'INR',
  },
  {
    code: 'IPRPL-MH-SOL',
    name: 'Maharashtra Solar Park',
    type: 'SITE',
    parentCode: 'IPRPL',
    ltreePath: 'grp.iprpl.mh_sol',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'OPERATIONAL',
    operationalBoundary: 'OPERATIONAL_CONTROL',
    sector: 'Solar PV Generation',
    country: 'IN',
    state: 'MH',
    city: 'Solapur',
    lat: 19.75,
    lng: 75.71,
    employeeCount: 320,
  },
  {
    code: 'IPRPL-GJ-WIN',
    name: 'Gujarat Wind Park',
    type: 'SITE',
    parentCode: 'IPRPL',
    ltreePath: 'grp.iprpl.gj_win',
    consolidationMethod: 'FULL',
    ownershipPct: 100,
    controlType: 'OPERATIONAL',
    operationalBoundary: 'OPERATIONAL_CONTROL',
    sector: 'Wind Generation',
    country: 'IN',
    state: 'GJ',
    city: 'Kutch',
    lat: 22.26,
    lng: 71.19,
    employeeCount: 150,
  },
];

async function seedHierarchy(tenantId: string) {
  // Build in two passes so parentId lookups are guaranteed to resolve.
  const codeToId = new Map<string, string>();

  // Pass 1: roots first (order is already ancestor-first in HIERARCHY).
  for (const node of HIERARCHY) {
    const parentId = node.parentCode ? codeToId.get(node.parentCode) ?? null : null;
    const upserted = await prisma.entityNode.upsert({
      where: { tenantId_code: { tenantId, code: node.code } },
      update: {
        ltreePath: node.ltreePath,
        parentId,
      },
      create: {
        tenantId,
        parentId,
        ltreePath: node.ltreePath,
        type: node.type as any,
        name: node.name,
        code: node.code,
        consolidationMethod: node.consolidationMethod as any,
        ownershipPct: dec(node.ownershipPct),
        controlType: node.controlType as any,
        operationalBoundary: node.operationalBoundary as any,
        sector: node.sector ?? null,
        isicCode: node.isicCode ?? null,
        country: node.country,
        state: node.state ?? null,
        city: node.city ?? null,
        lat: node.lat !== undefined ? dec(node.lat) : null,
        lng: node.lng !== undefined ? dec(node.lng) : null,
        employeeCount: node.employeeCount ?? null,
        revenue: node.revenue !== undefined ? dec(node.revenue) : null,
        currency: node.currency ?? null,
        effectiveFrom: new Date('2018-04-01T00:00:00.000Z'),
      },
    });
    codeToId.set(node.code, upserted.id);
  }

  console.log(`hierarchy: ${codeToId.size} entity nodes`);
  return codeToId;
}

// =====================================================================
// 3) ROLES
// =====================================================================

interface RoleSeed {
  name: string;
  description: string;
  permissions: string[];
}

// Permission strings MUST use dot-form (e.g. `metric.write`) — that's what
// @RequirePermissions(...) on controllers checks against. The AbacGuard
// does an exact-string set membership test, so 'metric:*' here would never
// match the controller's 'metric.write'.
const SYSTEM_ROLES: RoleSeed[] = [
  {
    name: 'GROUP_ADMIN',
    description: 'Full administrative control over the tenant.',
    permissions: [
      'user.read', 'user.invite', 'user.update', 'user.deactivate',
      'role.read', 'role.create', 'role.assign',
      'tenant.read', 'tenant.update', 'tenant.setting.read', 'tenant.setting.update',
      'hierarchy.read', 'hierarchy.write', 'hierarchy.delete',
      'materiality.read', 'materiality.write', 'materiality.sign',
      'file.read', 'file.write', 'file.upload', 'file.delete', 'file.reprocess',
      'metric.read', 'metric.write', 'metric.create', 'metric.submit', 'metric.approve', 'metric.lock',
      'extraction.read', 'extraction.write', 'extraction.review',
      'calc.read', 'calc.run', 'calc.write',
      'brsr.read', 'brsr.resolve', 'brsr.generate',
      'report.read', 'report.write', 'report.approve', 'report.file', 'report.generate',
      'supplier.read', 'supplier.write', 'supplier.invite',
      'carbon.read', 'carbon.write', 'carbon.abatement.write', 'carbon.credit.write', 'carbon.target.write',
      'assurance.read', 'assurance.write', 'assurance.raise', 'assurance.respond', 'assurance.sample', 'assurance.snapshot',
      'audit.read', 'audit.export',
      'formula.write', 'datasource.sync', 'datasource.write',
      'copilot.use',
    ],
  },
  {
    name: 'SUSTAINABILITY_MANAGER',
    description: 'Manages metric collection, materiality, reports, and the approval chain.',
    permissions: [
      'tenant.read', 'tenant.setting.read',
      'hierarchy.read',
      'user.read',
      'role.read',
      'materiality.read', 'materiality.write', 'materiality.sign',
      'file.read', 'file.write', 'file.upload', 'file.reprocess',
      'metric.read', 'metric.write', 'metric.create', 'metric.submit',
      'extraction.read', 'extraction.review',
      'calc.read', 'calc.run',
      'brsr.read', 'brsr.resolve',
      'report.read', 'report.write',
      'supplier.read', 'supplier.write', 'supplier.invite',
      'carbon.read',
      'assurance.read', 'assurance.respond',
      'copilot.use',
    ],
  },
  {
    name: 'PLANT_MANAGER',
    description: 'Captures and submits metric data for a single site.',
    permissions: [
      'tenant.read',
      'hierarchy.read',
      'file.read', 'file.upload',
      'metric.read', 'metric.write', 'metric.submit',
      'extraction.read',
      'brsr.read',
      'copilot.use',
    ],
  },
  {
    name: 'AUDITOR',
    description: 'Read-only access plus audit-trail and snapshot rights.',
    permissions: [
      'tenant.read',
      'hierarchy.read',
      'user.read',
      'role.read',
      'materiality.read',
      'file.read',
      'metric.read',
      'extraction.read',
      'calc.read',
      'brsr.read',
      'report.read',
      'supplier.read',
      'carbon.read',
      'assurance.read', 'assurance.snapshot',
      'audit.read', 'audit.export',
    ],
  },
];

async function seedRoles(tenantId: string) {
  const nameToId = new Map<string, string>();
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: r.name } },
      update: {
        description: r.description,
        permissions: r.permissions,
        isSystem: true,
      },
      create: {
        tenantId,
        name: r.name,
        description: r.description,
        isSystem: true,
        permissions: r.permissions,
      },
    });
    nameToId.set(r.name, role.id);
  }
  console.log(`roles: ${nameToId.size}`);
  return nameToId;
}

// =====================================================================
// 4) USERS + ROLE ASSIGNMENTS
// =====================================================================

interface UserSeed {
  email: string;
  firstName: string;
  lastName: string;
  idpSubject: string;
  roleName: string;
  scopeCode: string; // entity code where the role applies
}

const USERS: UserSeed[] = [
  {
    email: 'group.admin@imaginepowertree.example',
    firstName: 'Aarav',
    lastName: 'Mehta',
    idpSubject: 'kc:imagine:group-admin',
    roleName: 'GROUP_ADMIN',
    scopeCode: 'GRP',
  },
  {
    email: 'sustain.lead@imaginepowertree.example',
    firstName: 'Priya',
    lastName: 'Iyer',
    idpSubject: 'kc:imagine:sustain-lead',
    roleName: 'SUSTAINABILITY_MANAGER',
    scopeCode: 'GRP',
  },
  {
    email: 'tn.solar.pm@imaginepowertree.example',
    firstName: 'Karthik',
    lastName: 'Subramaniam',
    idpSubject: 'kc:imagine:tn-solar-pm',
    roleName: 'PLANT_MANAGER',
    scopeCode: 'IPIL-TN-SOL',
  },
  {
    email: 'mh.solar.pm@imaginepowertree.example',
    firstName: 'Rohan',
    lastName: 'Deshmukh',
    idpSubject: 'kc:imagine:mh-solar-pm',
    roleName: 'PLANT_MANAGER',
    scopeCode: 'IPRPL-MH-SOL',
  },
  {
    email: 'auditor@external-assurance.example',
    firstName: 'Neha',
    lastName: 'Khan',
    idpSubject: 'kc:external:assurance-auditor',
    roleName: 'AUDITOR',
    scopeCode: 'GRP',
  },
];

async function seedUsers(
  tenantId: string,
  roleIds: Map<string, string>,
  entityIds: Map<string, string>,
) {
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { idpSubject: u.idpSubject },
      update: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
      },
      create: {
        tenantId,
        idpSubject: u.idpSubject,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        locale: 'en-IN',
        timezone: 'Asia/Kolkata',
        isActive: true,
      },
    });

    const roleId = roleIds.get(u.roleName);
    const scopeNodeId = entityIds.get(u.scopeCode) ?? null;
    if (!roleId) continue;

    // Use a deterministic dedupe: find any existing assignment matching the
    // tuple, otherwise create a new one. Avoids relying on a composite unique
    // we don't have in the schema.
    const existing = await prisma.roleAssignment.findFirst({
      where: { userId: user.id, roleId, scopeNodeId },
    });
    if (!existing) {
      await prisma.roleAssignment.create({
        data: {
          userId: user.id,
          roleId,
          scopeNodeId,
          grantedBy: 'system',
        },
      });
    }
  }
  console.log(`users: ${USERS.length}`);
}

// =====================================================================
// 5) CANONICAL METRICS — 30+
// =====================================================================

interface CanonicalMetricSeed {
  key: string;
  name: string;
  description?: string;
  canonicalUnit: string;
  allowedUnits: string[];
  category: 'ENVIRONMENT' | 'SOCIAL' | 'GOVERNANCE';
  subcategory: string;
  dimensions?: Record<string, any>;
  aggregationRule:
    | 'SUM'
    | 'WEIGHTED_AVG'
    | 'LATEST'
    | 'MIN'
    | 'MAX'
    | 'FIRST'
    | 'COUNT';
  boundaryTag?:
    | 'SCOPE_1'
    | 'SCOPE_2_LOCATION'
    | 'SCOPE_2_MARKET'
    | 'SCOPE_3_CAT_1'
    | 'SCOPE_3_CAT_3'
    | 'SCOPE_3_CAT_4'
    | 'SCOPE_3_CAT_6'
    | 'SCOPE_3_CAT_7'
    | 'SCOPE_3_CAT_11'
    | 'N_A';
  gwpBasis?: 'AR5' | 'AR6_100Y' | 'AR6_20Y';
}

const CANONICAL_METRICS: CanonicalMetricSeed[] = [
  // ---------- Scope 1 direct emissions ----------
  {
    key: 'stationary_combustion_diesel_kg',
    name: 'Stationary combustion — diesel',
    description: 'Diesel burned in stationary equipment (gensets, boilers).',
    canonicalUnit: 'kg',
    allowedUnits: ['kg', 't', 'l'],
    category: 'ENVIRONMENT',
    subcategory: 'Direct Emissions',
    dimensions: { by_facility: ['string'], by_equipment: ['string'] },
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_1',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'stationary_combustion_natural_gas_m3',
    name: 'Stationary combustion — natural gas',
    canonicalUnit: 'm3',
    allowedUnits: ['m3', 'scm', 'MMBtu'],
    category: 'ENVIRONMENT',
    subcategory: 'Direct Emissions',
    dimensions: { by_facility: ['string'] },
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_1',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'mobile_combustion_diesel_l',
    name: 'Mobile combustion — diesel',
    description: 'Diesel burned in owned/leased fleet vehicles.',
    canonicalUnit: 'l',
    allowedUnits: ['l', 'kg'],
    category: 'ENVIRONMENT',
    subcategory: 'Direct Emissions',
    dimensions: { by_facility: ['string'], by_vehicle_class: ['string'] },
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_1',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'fugitive_refrigerant_r410a_kg',
    name: 'Fugitive emissions — R-410A',
    description: 'Refrigerant top-ups attributable to leakage.',
    canonicalUnit: 'kg',
    allowedUnits: ['kg', 'g'],
    category: 'ENVIRONMENT',
    subcategory: 'Fugitive Emissions',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_1',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'process_emissions_co2_kg',
    name: 'Process emissions — CO2',
    canonicalUnit: 'kg',
    allowedUnits: ['kg', 't'],
    category: 'ENVIRONMENT',
    subcategory: 'Process Emissions',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_1',
    gwpBasis: 'AR6_100Y',
  },

  // ---------- Scope 2 ----------
  {
    key: 'purchased_electricity_kwh',
    name: 'Purchased electricity (grid)',
    canonicalUnit: 'kWh',
    allowedUnits: ['kWh', 'MWh', 'GJ'],
    category: 'ENVIRONMENT',
    subcategory: 'Energy',
    dimensions: { by_facility: ['string'], by_grid_region: ['string'] },
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_2_LOCATION',
    gwpBasis: 'AR6_100Y',
  },
  {
    // Semantic synonym of purchased_electricity_kwh — the AI engine has
    // both keys in its registry (electricity_from_grid_kwh is the
    // "grid-only" lens; purchased_electricity_kwh is the broader purchase
    // bucket). Without this row, anything an extractor emits as
    // electricity_from_grid_kwh fails the promote-to-metric_event step
    // silently (no matching canonical_metric → return null in
    // ExtractionService.promoteToMetricEvent).
    key: 'electricity_from_grid_kwh',
    name: 'Electricity from grid (utility purchased, non-renewable)',
    canonicalUnit: 'kWh',
    allowedUnits: ['kWh', 'MWh', 'GJ'],
    category: 'ENVIRONMENT',
    subcategory: 'Energy',
    dimensions: { by_facility: ['string'], by_grid_region: ['string'] },
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_2_LOCATION',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'purchased_electricity_renewable_kwh',
    name: 'Purchased electricity — renewable (PPA/REC)',
    canonicalUnit: 'kWh',
    allowedUnits: ['kWh', 'MWh', 'GJ'],
    category: 'ENVIRONMENT',
    subcategory: 'Energy',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_2_MARKET',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'district_heating_kwh',
    name: 'Purchased district heating',
    canonicalUnit: 'kWh',
    allowedUnits: ['kWh', 'GJ'],
    category: 'ENVIRONMENT',
    subcategory: 'Energy',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_2_LOCATION',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'district_cooling_kwh',
    name: 'Purchased district cooling',
    canonicalUnit: 'kWh',
    allowedUnits: ['kWh', 'GJ'],
    category: 'ENVIRONMENT',
    subcategory: 'Energy',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_2_LOCATION',
    gwpBasis: 'AR6_100Y',
  },

  // ---------- Scope 3 ----------
  {
    key: 'business_travel_air_pkm',
    name: 'Business travel — air',
    canonicalUnit: 'pkm',
    allowedUnits: ['pkm', 'km'],
    category: 'ENVIRONMENT',
    subcategory: 'Value Chain — Travel',
    dimensions: { by_haul: ['short', 'medium', 'long'], by_class: ['economy', 'business', 'first'] },
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_6',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'business_travel_road_pkm',
    name: 'Business travel — road',
    canonicalUnit: 'pkm',
    allowedUnits: ['pkm', 'km'],
    category: 'ENVIRONMENT',
    subcategory: 'Value Chain — Travel',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_6',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'employee_commute_pkm',
    name: 'Employee commute',
    canonicalUnit: 'pkm',
    allowedUnits: ['pkm', 'km'],
    category: 'ENVIRONMENT',
    subcategory: 'Value Chain — Commute',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_7',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'purchased_goods_inr',
    name: 'Purchased goods & services (spend)',
    description: 'Spend-based Scope 3 cat 1 proxy.',
    canonicalUnit: 'INR',
    allowedUnits: ['INR', 'USD'],
    category: 'ENVIRONMENT',
    subcategory: 'Value Chain — Purchases',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_1',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'waste_landfill_t',
    name: 'Waste — landfill',
    canonicalUnit: 't',
    allowedUnits: ['t', 'kg'],
    category: 'ENVIRONMENT',
    subcategory: 'Waste',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_5',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'waste_recycled_t',
    name: 'Waste — recycled',
    canonicalUnit: 't',
    allowedUnits: ['t', 'kg'],
    category: 'ENVIRONMENT',
    subcategory: 'Waste',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_5',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'water_supply_m3',
    name: 'Use of sold products — water supplied',
    canonicalUnit: 'm3',
    allowedUnits: ['m3', 'kl'],
    category: 'ENVIRONMENT',
    subcategory: 'Value Chain — Use',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_11',
    gwpBasis: 'AR6_100Y',
  },
  {
    key: 'use_of_sold_products_kwh',
    name: 'Use of sold products — energy delivered',
    canonicalUnit: 'kWh',
    allowedUnits: ['kWh', 'MWh'],
    category: 'ENVIRONMENT',
    subcategory: 'Value Chain — Use',
    aggregationRule: 'SUM',
    boundaryTag: 'SCOPE_3_CAT_11',
    gwpBasis: 'AR6_100Y',
  },

  // ---------- Water ----------
  {
    key: 'water_withdrawal_freshwater_m3',
    name: 'Water withdrawal — freshwater',
    canonicalUnit: 'm3',
    allowedUnits: ['m3', 'kl', 'megaL'],
    category: 'ENVIRONMENT',
    subcategory: 'Water',
    dimensions: { by_facility: ['string'], by_source: ['surface', 'ground', 'municipal'] },
    aggregationRule: 'SUM',
    boundaryTag: 'N_A',
  },
  {
    key: 'water_withdrawal_seawater_m3',
    name: 'Water withdrawal — seawater',
    canonicalUnit: 'm3',
    allowedUnits: ['m3', 'megaL'],
    category: 'ENVIRONMENT',
    subcategory: 'Water',
    aggregationRule: 'SUM',
    boundaryTag: 'N_A',
  },
  {
    key: 'water_discharge_treated_m3',
    name: 'Water discharge — treated',
    canonicalUnit: 'm3',
    allowedUnits: ['m3', 'kl'],
    category: 'ENVIRONMENT',
    subcategory: 'Water',
    aggregationRule: 'SUM',
    boundaryTag: 'N_A',
  },
  {
    key: 'water_consumption_m3',
    name: 'Water consumption (withdrawal minus discharge)',
    canonicalUnit: 'm3',
    allowedUnits: ['m3'],
    category: 'ENVIRONMENT',
    subcategory: 'Water',
    aggregationRule: 'SUM',
    boundaryTag: 'N_A',
  },

  // ---------- Waste ----------
  {
    key: 'waste_hazardous_t',
    name: 'Waste — hazardous generated',
    canonicalUnit: 't',
    allowedUnits: ['t', 'kg'],
    category: 'ENVIRONMENT',
    subcategory: 'Waste',
    aggregationRule: 'SUM',
    boundaryTag: 'N_A',
  },
  {
    key: 'waste_non_hazardous_t',
    name: 'Waste — non-hazardous generated',
    canonicalUnit: 't',
    allowedUnits: ['t', 'kg'],
    category: 'ENVIRONMENT',
    subcategory: 'Waste',
    aggregationRule: 'SUM',
    boundaryTag: 'N_A',
  },
  {
    key: 'waste_recycled_pct',
    name: 'Waste — % recycled',
    description: 'Weighted average across facilities by tonnage.',
    canonicalUnit: '%',
    allowedUnits: ['%'],
    category: 'ENVIRONMENT',
    subcategory: 'Waste',
    aggregationRule: 'WEIGHTED_AVG',
    boundaryTag: 'N_A',
  },

  // ---------- Energy ----------
  {
    key: 'total_energy_consumed_gj',
    name: 'Total energy consumed',
    canonicalUnit: 'GJ',
    allowedUnits: ['GJ', 'TJ', 'MWh'],
    category: 'ENVIRONMENT',
    subcategory: 'Energy',
    aggregationRule: 'SUM',
    boundaryTag: 'N_A',
  },
  {
    key: 'renewable_energy_share_pct',
    name: 'Renewable energy share',
    description: 'Renewable kWh / total kWh (weighted).',
    canonicalUnit: '%',
    allowedUnits: ['%'],
    category: 'ENVIRONMENT',
    subcategory: 'Energy',
    aggregationRule: 'WEIGHTED_AVG',
    boundaryTag: 'N_A',
  },

  // ---------- Social ----------
  {
    key: 'total_employees',
    name: 'Total employees',
    canonicalUnit: 'count',
    allowedUnits: ['count'],
    category: 'SOCIAL',
    subcategory: 'Workforce',
    aggregationRule: 'LATEST',
  },
  {
    key: 'permanent_employees',
    name: 'Permanent employees',
    canonicalUnit: 'count',
    allowedUnits: ['count'],
    category: 'SOCIAL',
    subcategory: 'Workforce',
    aggregationRule: 'LATEST',
  },
  {
    key: 'women_employees_pct',
    name: 'Women employees (share of total)',
    canonicalUnit: '%',
    allowedUnits: ['%'],
    category: 'SOCIAL',
    subcategory: 'Diversity',
    aggregationRule: 'WEIGHTED_AVG',
  },
  {
    key: 'ltifr',
    name: 'Lost Time Injury Frequency Rate',
    description: 'Lost-time injuries per million hours worked.',
    canonicalUnit: 'per_million_hours',
    allowedUnits: ['per_million_hours'],
    category: 'SOCIAL',
    subcategory: 'Health & Safety',
    aggregationRule: 'WEIGHTED_AVG',
  },
  {
    key: 'training_hours_per_employee',
    name: 'Training hours per employee',
    canonicalUnit: 'hours',
    allowedUnits: ['hours'],
    category: 'SOCIAL',
    subcategory: 'Training & Development',
    aggregationRule: 'WEIGHTED_AVG',
  },
  {
    key: 'median_remuneration_inr',
    name: 'Median remuneration',
    canonicalUnit: 'INR',
    allowedUnits: ['INR'],
    category: 'SOCIAL',
    subcategory: 'Compensation',
    aggregationRule: 'WEIGHTED_AVG',
  },
  {
    key: 'complaints_consumer_count',
    name: 'Consumer complaints — received',
    canonicalUnit: 'count',
    allowedUnits: ['count'],
    category: 'SOCIAL',
    subcategory: 'Customer Experience',
    aggregationRule: 'SUM',
  },
  {
    key: 'complaints_resolved_count',
    name: 'Consumer complaints — resolved',
    canonicalUnit: 'count',
    allowedUnits: ['count'],
    category: 'SOCIAL',
    subcategory: 'Customer Experience',
    aggregationRule: 'SUM',
  },

  // ---------- Governance ----------
  {
    key: 'independent_directors_pct',
    name: 'Independent directors (share of board)',
    canonicalUnit: '%',
    allowedUnits: ['%'],
    category: 'GOVERNANCE',
    subcategory: 'Board Composition',
    aggregationRule: 'LATEST',
  },
  {
    key: 'women_on_board_pct',
    name: 'Women on board (share)',
    canonicalUnit: '%',
    allowedUnits: ['%'],
    category: 'GOVERNANCE',
    subcategory: 'Board Composition',
    aggregationRule: 'LATEST',
  },
  {
    key: 'board_meetings_count',
    name: 'Board meetings held',
    canonicalUnit: 'count',
    allowedUnits: ['count'],
    category: 'GOVERNANCE',
    subcategory: 'Board Activity',
    aggregationRule: 'SUM',
  },
  {
    key: 'code_of_conduct_violations_count',
    name: 'Code of conduct violations',
    canonicalUnit: 'count',
    allowedUnits: ['count'],
    category: 'GOVERNANCE',
    subcategory: 'Ethics',
    aggregationRule: 'SUM',
  },
];

async function seedCanonicalMetrics() {
  for (const m of CANONICAL_METRICS) {
    await prisma.canonicalMetric.upsert({
      where: { key: m.key },
      update: {
        name: m.name,
        description: m.description ?? null,
        canonicalUnit: m.canonicalUnit,
        allowedUnits: m.allowedUnits,
        category: m.category as any,
        subcategory: m.subcategory,
        dimensions: (m.dimensions ?? {}) as any,
        aggregationRule: m.aggregationRule as any,
        boundaryTag: (m.boundaryTag as any) ?? null,
        gwpBasis: (m.gwpBasis as any) ?? null,
        validFrom: VALID_FROM_2018,
        isActive: true,
      },
      create: {
        key: m.key,
        name: m.name,
        description: m.description ?? null,
        canonicalUnit: m.canonicalUnit,
        allowedUnits: m.allowedUnits,
        category: m.category as any,
        subcategory: m.subcategory,
        dimensions: (m.dimensions ?? {}) as any,
        aggregationRule: m.aggregationRule as any,
        boundaryTag: (m.boundaryTag as any) ?? null,
        gwpBasis: (m.gwpBasis as any) ?? null,
        version: 1,
        validFrom: VALID_FROM_2018,
        isActive: true,
      },
    });
  }
  console.log(`canonical metrics: ${CANONICAL_METRICS.length}`);
}

// =====================================================================
// 6) FRAMEWORK MAPPINGS — 30+ across BRSR / GRI / SASB / TCFD / IFRS S2
// =====================================================================

interface FrameworkMappingSeed {
  framework:
    | 'BRSR'
    | 'BRSR_CORE'
    | 'GRI'
    | 'SASB'
    | 'TCFD'
    | 'IFRS_S1'
    | 'IFRS_S2'
    | 'CSRD_ESRS'
    | 'CDP';
  frameworkCode: string;
  frameworkSection?: string;
  version: string;
  canonicalKeys: string[];
  formula?: any;
  narrativeTemplate?: string;
}

const FRAMEWORK_MAPPINGS: FrameworkMappingSeed[] = [
  // ---------- BRSR Principle 1: Ethics ----------
  {
    framework: 'BRSR',
    frameworkCode: 'P1-Q1.a',
    frameworkSection: 'Principle 1',
    version: '2024',
    canonicalKeys: ['code_of_conduct_violations_count'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P1-Q1.b',
    frameworkSection: 'Principle 1',
    version: '2024',
    canonicalKeys: ['board_meetings_count'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P1-Q2',
    frameworkSection: 'Principle 1',
    version: '2024',
    canonicalKeys: ['independent_directors_pct'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P1-Q3',
    frameworkSection: 'Principle 1',
    version: '2024',
    canonicalKeys: ['women_on_board_pct'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P1-Q4',
    frameworkSection: 'Principle 1',
    version: '2024',
    canonicalKeys: ['training_hours_per_employee'],
  },

  // ---------- BRSR Principle 3: Employees ----------
  {
    framework: 'BRSR',
    frameworkCode: 'P3-Q1.a',
    frameworkSection: 'Principle 3',
    version: '2024',
    canonicalKeys: ['total_employees', 'permanent_employees'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P3-Q1.b',
    frameworkSection: 'Principle 3',
    version: '2024',
    canonicalKeys: ['women_employees_pct'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P3-Q2',
    frameworkSection: 'Principle 3',
    version: '2024',
    canonicalKeys: ['ltifr'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P3-Q3',
    frameworkSection: 'Principle 3',
    version: '2024',
    canonicalKeys: ['training_hours_per_employee'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P3-Q4',
    frameworkSection: 'Principle 3',
    version: '2024',
    canonicalKeys: ['median_remuneration_inr'],
  },

  // ---------- BRSR Principle 5: Human rights ----------
  {
    framework: 'BRSR',
    frameworkCode: 'P5-Q1',
    frameworkSection: 'Principle 5',
    version: '2024',
    canonicalKeys: ['training_hours_per_employee'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P5-Q2',
    frameworkSection: 'Principle 5',
    version: '2024',
    canonicalKeys: ['code_of_conduct_violations_count'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P5-Q3',
    frameworkSection: 'Principle 5',
    version: '2024',
    canonicalKeys: ['complaints_consumer_count'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P5-Q4',
    frameworkSection: 'Principle 5',
    version: '2024',
    canonicalKeys: ['median_remuneration_inr'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P5-Q5',
    frameworkSection: 'Principle 5',
    version: '2024',
    canonicalKeys: ['women_employees_pct'],
  },

  // ---------- BRSR Principle 6: Environment ----------
  {
    framework: 'BRSR',
    frameworkCode: 'P6-Q1.a',
    frameworkSection: 'Principle 6',
    version: '2024',
    canonicalKeys: ['total_energy_consumed_gj'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P6-Q1.b',
    frameworkSection: 'Principle 6',
    version: '2024',
    canonicalKeys: ['renewable_energy_share_pct'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P6-Q3.a',
    frameworkSection: 'Principle 6',
    version: '2024',
    canonicalKeys: ['water_withdrawal_freshwater_m3', 'water_withdrawal_seawater_m3'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P6-Q3.b',
    frameworkSection: 'Principle 6',
    version: '2024',
    canonicalKeys: ['water_discharge_treated_m3', 'water_consumption_m3'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P6-Q5',
    frameworkSection: 'Principle 6',
    version: '2024',
    canonicalKeys: [
      'stationary_combustion_diesel_kg',
      'stationary_combustion_natural_gas_m3',
      'mobile_combustion_diesel_l',
      'fugitive_refrigerant_r410a_kg',
      'process_emissions_co2_kg',
    ],
    narrativeTemplate:
      'Scope 1 GHG emissions for {fy} totalled {scope1_tco2e} tCO2e across {site_count} sites.',
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P6-Q6',
    frameworkSection: 'Principle 6',
    version: '2024',
    // Forensic Flow #5: the AI engine's DISCOM extractor can emit either
    // `purchased_electricity_kwh` OR `electricity_from_grid_kwh` for the
    // same physical reading (two synonymous keys in its registry). Cover
    // both so the BRSR P6-Q6 aggregation doesn't silently drop one half
    // of the customer's electricity data.
    canonicalKeys: [
      'purchased_electricity_kwh',
      'electricity_from_grid_kwh',
      'purchased_electricity_renewable_kwh',
    ],
    narrativeTemplate:
      'Scope 2 (location-based) GHG emissions were {scope2_loc_tco2e} tCO2e; market-based {scope2_mkt_tco2e} tCO2e.',
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P6-Q7',
    frameworkSection: 'Principle 6',
    version: '2024',
    canonicalKeys: ['waste_landfill_t', 'waste_recycled_t', 'waste_hazardous_t', 'waste_non_hazardous_t', 'waste_recycled_pct'],
  },

  // ---------- BRSR Principle 7: Public policy ----------
  {
    framework: 'BRSR',
    frameworkCode: 'P7-Q1',
    frameworkSection: 'Principle 7',
    version: '2024',
    canonicalKeys: ['board_meetings_count'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P7-Q2',
    frameworkSection: 'Principle 7',
    version: '2024',
    canonicalKeys: ['code_of_conduct_violations_count'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P7-Q3',
    frameworkSection: 'Principle 7',
    version: '2024',
    canonicalKeys: ['independent_directors_pct'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P7-Q4',
    frameworkSection: 'Principle 7',
    version: '2024',
    canonicalKeys: ['women_on_board_pct'],
  },
  {
    framework: 'BRSR',
    frameworkCode: 'P7-Q5',
    frameworkSection: 'Principle 7',
    version: '2024',
    canonicalKeys: ['training_hours_per_employee'],
  },

  // ---------- GRI ----------
  {
    framework: 'GRI',
    frameworkCode: '302-1',
    frameworkSection: 'Energy consumption within the organization',
    version: '2024',
    canonicalKeys: ['total_energy_consumed_gj', 'renewable_energy_share_pct'],
  },
  {
    framework: 'GRI',
    frameworkCode: '302-3',
    frameworkSection: 'Energy intensity',
    version: '2024',
    canonicalKeys: ['total_energy_consumed_gj'],
  },
  {
    framework: 'GRI',
    frameworkCode: '305-1',
    frameworkSection: 'Direct (Scope 1) GHG emissions',
    version: '2024',
    canonicalKeys: [
      'stationary_combustion_diesel_kg',
      'stationary_combustion_natural_gas_m3',
      'mobile_combustion_diesel_l',
      'fugitive_refrigerant_r410a_kg',
      'process_emissions_co2_kg',
    ],
  },
  {
    framework: 'GRI',
    frameworkCode: '305-2',
    frameworkSection: 'Energy indirect (Scope 2) GHG emissions',
    version: '2024',
    canonicalKeys: ['purchased_electricity_kwh', 'purchased_electricity_renewable_kwh', 'district_heating_kwh', 'district_cooling_kwh'],
  },
  {
    framework: 'GRI',
    frameworkCode: '305-3',
    frameworkSection: 'Other indirect (Scope 3) GHG emissions',
    version: '2024',
    canonicalKeys: [
      'business_travel_air_pkm',
      'business_travel_road_pkm',
      'employee_commute_pkm',
      'purchased_goods_inr',
    ],
  },
  {
    framework: 'GRI',
    frameworkCode: '305-4',
    frameworkSection: 'GHG emissions intensity',
    version: '2024',
    canonicalKeys: ['total_energy_consumed_gj'],
  },
  {
    framework: 'GRI',
    frameworkCode: '401-1',
    frameworkSection: 'New employee hires and employee turnover',
    version: '2024',
    canonicalKeys: ['total_employees', 'permanent_employees'],
  },
  {
    framework: 'GRI',
    frameworkCode: '403-9',
    frameworkSection: 'Work-related injuries',
    version: '2024',
    canonicalKeys: ['ltifr'],
  },

  // ---------- SASB (Utilities) ----------
  {
    framework: 'SASB',
    frameworkCode: 'IF-EU-110a.1',
    frameworkSection: 'GHG emissions — gross global Scope 1',
    version: '2024',
    canonicalKeys: ['stationary_combustion_diesel_kg', 'stationary_combustion_natural_gas_m3'],
  },
  {
    framework: 'SASB',
    frameworkCode: 'IF-EU-110a.2',
    frameworkSection: 'GHG emissions — % of Scope 1 covered under regulation',
    version: '2024',
    canonicalKeys: ['process_emissions_co2_kg'],
  },

  // ---------- TCFD ----------
  {
    framework: 'TCFD',
    frameworkCode: 'Metrics-a',
    frameworkSection: 'Metrics & Targets — Climate-related metrics',
    version: '2024',
    canonicalKeys: ['total_energy_consumed_gj', 'renewable_energy_share_pct'],
  },
  {
    framework: 'TCFD',
    frameworkCode: 'Metrics-b',
    frameworkSection: 'Metrics & Targets — Scope 1, 2, 3 emissions',
    version: '2024',
    canonicalKeys: [
      'stationary_combustion_diesel_kg',
      'purchased_electricity_kwh',
      'business_travel_air_pkm',
    ],
  },
  {
    framework: 'TCFD',
    frameworkCode: 'Metrics-c',
    frameworkSection: 'Metrics & Targets — Climate-related targets',
    version: '2024',
    canonicalKeys: ['renewable_energy_share_pct'],
  },

  // ---------- IFRS S2 ----------
  {
    framework: 'IFRS_S2',
    frameworkCode: 'S2-29.a.i',
    frameworkSection: 'Climate-related metrics — Scope 1',
    version: '2024',
    canonicalKeys: ['stationary_combustion_diesel_kg', 'mobile_combustion_diesel_l'],
  },
  {
    framework: 'IFRS_S2',
    frameworkCode: 'S2-29.a.ii',
    frameworkSection: 'Climate-related metrics — Scope 2',
    version: '2024',
    canonicalKeys: ['purchased_electricity_kwh', 'purchased_electricity_renewable_kwh'],
  },
  {
    framework: 'IFRS_S2',
    frameworkCode: 'S2-29.a.iii',
    frameworkSection: 'Climate-related metrics — Scope 3',
    version: '2024',
    canonicalKeys: ['business_travel_air_pkm', 'purchased_goods_inr'],
  },
];

async function seedFrameworkMappings() {
  for (const fm of FRAMEWORK_MAPPINGS) {
    await prisma.frameworkMapping.upsert({
      where: {
        framework_frameworkCode_version: {
          framework: fm.framework as any,
          frameworkCode: fm.frameworkCode,
          version: fm.version,
        },
      },
      update: {
        canonicalKeys: fm.canonicalKeys,
        narrativeTemplate: fm.narrativeTemplate ?? null,
        frameworkSection: fm.frameworkSection ?? null,
      },
      create: {
        framework: fm.framework as any,
        frameworkCode: fm.frameworkCode,
        frameworkSection: fm.frameworkSection ?? null,
        version: fm.version,
        canonicalKeys: fm.canonicalKeys,
        formula: fm.formula ?? null,
        narrativeTemplate: fm.narrativeTemplate ?? null,
        validFrom: VALID_FROM_2018,
      },
    });
  }
  console.log(`framework mappings: ${FRAMEWORK_MAPPINGS.length}`);
}

// =====================================================================
// 7) EMISSION FACTORS — 50+
// CEA v18 India grid by state (FY2022-23 release), DEFRA 2024,
// IPCC AR6 GWP-100 reference, plus waste & water treatment factors.
// =====================================================================

interface EmissionFactorSeed {
  source:
    | 'DEFRA_2024'
    | 'CEA_V18'
    | 'IPCC_AR6'
    | 'EXIOBASE'
    | 'WIO'
    | 'SECTOR_SPECIFIC'
    | 'CUSTOM_TENANT';
  category: string;
  subCategory?: string;
  activityType: string;
  region?: string;
  gas: 'CO2' | 'CH4' | 'N2O' | 'HFC' | 'PFC' | 'SF6' | 'NF3' | 'MIXED';
  value: number;
  unit: string;
  gwpBasis?: 'AR5' | 'AR6_100Y' | 'AR6_20Y';
  citation: string;
  validFrom: Date;
}

// India CEA v18 grid emission factors — kgCO2e/kWh. Real-world values
// are state-specific because grid mix varies widely. Numbers below are
// representative published values from the CEA CO2 Baseline Database v18.
const CEA_STATE_FACTORS: Array<{ region: string; value: number }> = [
  { region: 'IN-KA', value: 0.71 },
  { region: 'IN-TN', value: 0.79 },
  { region: 'IN-MH', value: 0.85 },
  { region: 'IN-GJ', value: 0.82 },
  { region: 'IN-AP', value: 0.84 },
  { region: 'IN-TS', value: 0.83 },
  { region: 'IN-KL', value: 0.65 },
  { region: 'IN-UP', value: 0.95 },
  { region: 'IN-MP', value: 0.93 },
  { region: 'IN-RJ', value: 0.81 },
  { region: 'IN-WB', value: 0.91 },
  { region: 'IN-DL', value: 0.78 },
];

const DEFRA_FACTORS: EmissionFactorSeed[] = [
  // Stationary fuels
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'STATIONARY', activityType: 'DIESEL', gas: 'CO2', value: 2.6878, unit: 'kgCO2e/litre', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA GHG conversion factors 2024 — Stationary diesel', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'STATIONARY', activityType: 'PETROL', gas: 'CO2', value: 2.3146, unit: 'kgCO2e/litre', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Petrol (Motor)', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'STATIONARY', activityType: 'NATURAL_GAS', gas: 'CO2', value: 2.0428, unit: 'kgCO2e/m3', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Natural gas', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'STATIONARY', activityType: 'LPG', gas: 'CO2', value: 1.5571, unit: 'kgCO2e/litre', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — LPG', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'STATIONARY', activityType: 'COAL_STEAM', gas: 'CO2', value: 2403.0, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Industrial steam coal', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'STATIONARY', activityType: 'COAL_COKING', gas: 'CO2', value: 3164.0, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Coking coal', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'STATIONARY', activityType: 'KEROSENE', gas: 'CO2', value: 2.5404, unit: 'kgCO2e/litre', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Burning oil (kerosene)', validFrom: DEFRA_VALID_FROM },

  // Mobile fuels
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'MOBILE', activityType: 'DIESEL', gas: 'CO2', value: 2.6878, unit: 'kgCO2e/litre', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Diesel (mobile)', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FUEL', subCategory: 'MOBILE', activityType: 'PETROL', gas: 'CO2', value: 2.3146, unit: 'kgCO2e/litre', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Petrol (mobile)', validFrom: DEFRA_VALID_FROM },

  // Business travel — air
  { source: 'DEFRA_2024', category: 'TRAVEL', subCategory: 'AIR', activityType: 'SHORT_HAUL_ECONOMY', gas: 'MIXED', value: 0.15102, unit: 'kgCO2e/pkm', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Air, short-haul, economy', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'TRAVEL', subCategory: 'AIR', activityType: 'MEDIUM_HAUL_ECONOMY', gas: 'MIXED', value: 0.13386, unit: 'kgCO2e/pkm', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Air, medium-haul, economy', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'TRAVEL', subCategory: 'AIR', activityType: 'LONG_HAUL_ECONOMY', gas: 'MIXED', value: 0.14981, unit: 'kgCO2e/pkm', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Air, long-haul, economy', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'TRAVEL', subCategory: 'AIR', activityType: 'LONG_HAUL_BUSINESS', gas: 'MIXED', value: 0.43445, unit: 'kgCO2e/pkm', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Air, long-haul, business', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'TRAVEL', subCategory: 'AIR', activityType: 'LONG_HAUL_FIRST', gas: 'MIXED', value: 0.59922, unit: 'kgCO2e/pkm', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Air, long-haul, first', validFrom: DEFRA_VALID_FROM },

  // Business travel / freight — road
  { source: 'DEFRA_2024', category: 'TRAVEL', subCategory: 'ROAD', activityType: 'CAR_AVERAGE', gas: 'MIXED', value: 0.16844, unit: 'kgCO2e/km', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Average car', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FREIGHT', subCategory: 'ROAD', activityType: 'VAN_DIESEL_AVG', gas: 'MIXED', value: 0.24216, unit: 'kgCO2e/km', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Van, diesel average', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'FREIGHT', subCategory: 'ROAD', activityType: 'HGV_AVERAGE', gas: 'MIXED', value: 0.79839, unit: 'kgCO2e/km', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — HGV (rigid + artic) average', validFrom: DEFRA_VALID_FROM },

  // Refrigerants (single-row HFC entries)
  { source: 'DEFRA_2024', category: 'REFRIGERANT', subCategory: 'HFC', activityType: 'R134A', gas: 'HFC', value: 1430.0, unit: 'kgCO2e/kg', gwpBasis: 'AR5', citation: 'UK BEIS / DEFRA 2024 — Refrigerant HFC-134a (AR5 GWP)', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'REFRIGERANT', subCategory: 'HFC', activityType: 'R410A', gas: 'HFC', value: 2088.0, unit: 'kgCO2e/kg', gwpBasis: 'AR5', citation: 'UK BEIS / DEFRA 2024 — Refrigerant R-410A (AR5)', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'REFRIGERANT', subCategory: 'HFC', activityType: 'R32', gas: 'HFC', value: 675.0, unit: 'kgCO2e/kg', gwpBasis: 'AR5', citation: 'UK BEIS / DEFRA 2024 — Refrigerant R-32 (AR5)', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'REFRIGERANT', subCategory: 'HFC', activityType: 'R23', gas: 'HFC', value: 14800.0, unit: 'kgCO2e/kg', gwpBasis: 'AR5', citation: 'UK BEIS / DEFRA 2024 — Refrigerant R-23 (AR5)', validFrom: DEFRA_VALID_FROM },
];

const IPCC_GWP_FACTORS: EmissionFactorSeed[] = [
  { source: 'IPCC_AR6', category: 'GWP_REFERENCE', subCategory: 'AR6_100Y', activityType: 'CO2', gas: 'CO2', value: 1.0, unit: 'kgCO2e/kg', gwpBasis: 'AR6_100Y', citation: 'IPCC AR6 WG1 Ch.7 — GWP-100 CO2', validFrom: VALID_FROM_2018 },
  { source: 'IPCC_AR6', category: 'GWP_REFERENCE', subCategory: 'AR6_100Y', activityType: 'CH4', gas: 'CH4', value: 27.9, unit: 'kgCO2e/kg', gwpBasis: 'AR6_100Y', citation: 'IPCC AR6 WG1 Ch.7 — GWP-100 fossil CH4', validFrom: VALID_FROM_2018 },
  { source: 'IPCC_AR6', category: 'GWP_REFERENCE', subCategory: 'AR6_100Y', activityType: 'N2O', gas: 'N2O', value: 273.0, unit: 'kgCO2e/kg', gwpBasis: 'AR6_100Y', citation: 'IPCC AR6 WG1 Ch.7 — GWP-100 N2O', validFrom: VALID_FROM_2018 },
  { source: 'IPCC_AR6', category: 'GWP_REFERENCE', subCategory: 'AR6_100Y', activityType: 'SF6', gas: 'SF6', value: 24300.0, unit: 'kgCO2e/kg', gwpBasis: 'AR6_100Y', citation: 'IPCC AR6 WG1 Ch.7 — GWP-100 SF6', validFrom: VALID_FROM_2018 },
  { source: 'IPCC_AR6', category: 'GWP_REFERENCE', subCategory: 'AR6_100Y', activityType: 'NF3', gas: 'NF3', value: 17400.0, unit: 'kgCO2e/kg', gwpBasis: 'AR6_100Y', citation: 'IPCC AR6 WG1 Ch.7 — GWP-100 NF3', validFrom: VALID_FROM_2018 },
  { source: 'IPCC_AR6', category: 'GWP_REFERENCE', subCategory: 'AR6_100Y', activityType: 'HFC_134A', gas: 'HFC', value: 1530.0, unit: 'kgCO2e/kg', gwpBasis: 'AR6_100Y', citation: 'IPCC AR6 WG1 Ch.7 — GWP-100 HFC-134a', validFrom: VALID_FROM_2018 },
  { source: 'IPCC_AR6', category: 'GWP_REFERENCE', subCategory: 'AR6_100Y', activityType: 'HFC_32', gas: 'HFC', value: 771.0, unit: 'kgCO2e/kg', gwpBasis: 'AR6_100Y', citation: 'IPCC AR6 WG1 Ch.7 — GWP-100 HFC-32', validFrom: VALID_FROM_2018 },
];

const WASTE_AND_WATER_FACTORS: EmissionFactorSeed[] = [
  { source: 'DEFRA_2024', category: 'WASTE', subCategory: 'LANDFILL', activityType: 'MUNICIPAL_MIXED', gas: 'MIXED', value: 458.97, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Mixed municipal waste to landfill', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WASTE', subCategory: 'LANDFILL', activityType: 'PAPER', gas: 'MIXED', value: 1041.62, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Paper to landfill', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WASTE', subCategory: 'INCINERATION', activityType: 'MUNICIPAL_MIXED', gas: 'MIXED', value: 21.28, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Mixed waste incineration with energy recovery', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WASTE', subCategory: 'RECYCLING', activityType: 'PAPER', gas: 'MIXED', value: 21.28, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Paper closed-loop recycling', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WASTE', subCategory: 'RECYCLING', activityType: 'PLASTIC', gas: 'MIXED', value: 21.28, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Plastic recycling', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WASTE', subCategory: 'RECYCLING', activityType: 'METAL', gas: 'MIXED', value: 21.28, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Metal recycling', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WASTE', subCategory: 'RECYCLING', activityType: 'GLASS', gas: 'MIXED', value: 21.28, unit: 'kgCO2e/tonne', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Glass recycling', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WATER', subCategory: 'SUPPLY', activityType: 'POTABLE_SUPPLY', gas: 'MIXED', value: 0.149, unit: 'kgCO2e/m3', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Water supply (treatment + distribution)', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WATER', subCategory: 'TREATMENT', activityType: 'WASTEWATER_TREATMENT', gas: 'MIXED', value: 0.272, unit: 'kgCO2e/m3', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Wastewater treatment', validFrom: DEFRA_VALID_FROM },
  { source: 'DEFRA_2024', category: 'WATER', subCategory: 'TREATMENT', activityType: 'INDUSTRIAL_EFFLUENT', gas: 'MIXED', value: 0.708, unit: 'kgCO2e/m3', gwpBasis: 'AR6_100Y', citation: 'UK BEIS / DEFRA 2024 — Industrial effluent treatment', validFrom: DEFRA_VALID_FROM },
];

async function seedEmissionFactors(tenantId: string) {
  let count = 0;

  // CEA v18 India grid by state. Indian grid factors are intentionally
  // state-level because intra-state grid mix differs (KA is hydro-heavy,
  // UP is coal-heavy), and they are dated FY2022-23 because CEA publishes
  // these annually — so we keep `valid_from` to mark vintage.
  for (const f of CEA_STATE_FACTORS) {
    await prisma.emissionFactor.upsert({
      where: { id: `cea_v18_${f.region}` },
      update: {
        value: dec(f.value),
        validFrom: CEA_VALID_FROM,
      },
      create: {
        id: `cea_v18_${f.region}`,
        source: 'CEA_V18',
        tenantId: null,
        category: 'ELECTRICITY',
        subCategory: 'GRID',
        activityType: 'PURCHASED_ELECTRICITY',
        region: f.region,
        gas: 'CO2',
        value: dec(f.value),
        unit: 'kgCO2e/kWh',
        gwpBasis: 'AR6_100Y',
        citation: 'CEA CO2 Baseline Database for the Indian Power Sector v18 (FY2022-23)',
        validFrom: CEA_VALID_FROM,
      },
    });
    count++;
  }

  // DEFRA 2024 fuels, travel, refrigerants
  for (const f of DEFRA_FACTORS) {
    const stableId = `defra_2024_${f.category}_${f.subCategory ?? 'NA'}_${f.activityType}`.toLowerCase();
    await prisma.emissionFactor.upsert({
      where: { id: stableId },
      update: { value: dec(f.value), validFrom: f.validFrom },
      create: {
        id: stableId,
        source: f.source as any,
        tenantId: null,
        category: f.category,
        subCategory: f.subCategory ?? null,
        activityType: f.activityType,
        region: f.region ?? null,
        gas: f.gas as any,
        value: dec(f.value),
        unit: f.unit,
        gwpBasis: (f.gwpBasis as any) ?? null,
        citation: f.citation,
        validFrom: f.validFrom,
      },
    });
    count++;
  }

  // IPCC AR6 reference GWPs
  for (const f of IPCC_GWP_FACTORS) {
    const stableId = `ipcc_ar6_${f.activityType}`.toLowerCase();
    await prisma.emissionFactor.upsert({
      where: { id: stableId },
      update: { value: dec(f.value) },
      create: {
        id: stableId,
        source: f.source as any,
        tenantId: null,
        category: f.category,
        subCategory: f.subCategory ?? null,
        activityType: f.activityType,
        gas: f.gas as any,
        value: dec(f.value),
        unit: f.unit,
        gwpBasis: (f.gwpBasis as any) ?? null,
        citation: f.citation,
        validFrom: f.validFrom,
      },
    });
    count++;
  }

  // Waste & water DEFRA factors
  for (const f of WASTE_AND_WATER_FACTORS) {
    const stableId = `defra_2024_${f.category}_${f.subCategory ?? 'NA'}_${f.activityType}`.toLowerCase();
    await prisma.emissionFactor.upsert({
      where: { id: stableId },
      update: { value: dec(f.value) },
      create: {
        id: stableId,
        source: f.source as any,
        tenantId: null,
        category: f.category,
        subCategory: f.subCategory ?? null,
        activityType: f.activityType,
        gas: f.gas as any,
        value: dec(f.value),
        unit: f.unit,
        gwpBasis: (f.gwpBasis as any) ?? null,
        citation: f.citation,
        validFrom: f.validFrom,
      },
    });
    count++;
  }

  console.log(`emission factors: ${count}`);
}

// =====================================================================
// 8) APPROVAL WORKFLOWS
// =====================================================================

async function seedWorkflows(tenantId: string) {
  await prisma.approvalWorkflow.upsert({
    where: { tenantId_scope_name: { tenantId, scope: 'METRIC', name: 'Default Metric Approval' } },
    update: {},
    create: {
      tenantId,
      name: 'Default Metric Approval',
      scope: 'METRIC',
      isDefault: true,
      config: {
        steps: [
          { step: 1, role: 'SUSTAINABILITY_MANAGER', slaHours: 48 },
          { step: 2, role: 'GROUP_ADMIN', slaHours: 24 },
        ],
      } as any,
    },
  });

  await prisma.approvalWorkflow.upsert({
    where: { tenantId_scope_name: { tenantId, scope: 'REPORT', name: 'Default Report Approval' } },
    update: {},
    create: {
      tenantId,
      name: 'Default Report Approval',
      scope: 'REPORT',
      isDefault: true,
      config: {
        steps: [
          { step: 1, role: 'SUSTAINABILITY_MANAGER', slaHours: 72 },
          { step: 2, role: 'GROUP_ADMIN', slaHours: 48 },
          { step: 3, role: 'AUDITOR', slaHours: 168 },
        ],
      } as any,
    },
  });

  console.log('workflows: 2');
}

// =====================================================================
// 9) MATERIALITY (topics + stakeholders + assessment run)
// =====================================================================

const BRSR_MATERIAL_TOPICS: Array<{ code: string; name: string; category: 'ENVIRONMENT' | 'SOCIAL' | 'GOVERNANCE' }> = [
  { code: 'BRSR-T01-GHG', name: 'GHG emissions & climate change', category: 'ENVIRONMENT' },
  { code: 'BRSR-T02-WATER', name: 'Water stewardship', category: 'ENVIRONMENT' },
  { code: 'BRSR-T03-WASTE', name: 'Waste & circular economy', category: 'ENVIRONMENT' },
  { code: 'BRSR-T04-BIO', name: 'Biodiversity & land use', category: 'ENVIRONMENT' },
  { code: 'BRSR-T05-HS', name: 'Employee health & safety', category: 'SOCIAL' },
  { code: 'BRSR-T06-DIV', name: 'Diversity, equity & inclusion', category: 'SOCIAL' },
  { code: 'BRSR-T07-HR', name: 'Human rights in operations & value chain', category: 'SOCIAL' },
  { code: 'BRSR-T08-COMM', name: 'Community impact & inclusive growth', category: 'SOCIAL' },
  { code: 'BRSR-T09-GOV', name: 'Board independence & governance', category: 'GOVERNANCE' },
  { code: 'BRSR-T10-ETH', name: 'Anti-corruption & ethics', category: 'GOVERNANCE' },
  { code: 'BRSR-T11-DATA', name: 'Data privacy & cyber resilience', category: 'GOVERNANCE' },
  { code: 'BRSR-T12-PROD', name: 'Product safety & responsibility', category: 'GOVERNANCE' },
];

async function seedMateriality(tenantId: string) {
  // 6 material topics anchored to BRSR (the tenant_id is set so they're
  // tenant-private — RLS will hide them from other tenants).
  for (const t of BRSR_MATERIAL_TOPICS.slice(0, 6)) {
    await prisma.materialTopic.upsert({
      where: { tenantId_framework_code: { tenantId, framework: 'BRSR', code: t.code } },
      update: { name: t.name, defaultCategory: t.category as any },
      create: {
        tenantId,
        framework: 'BRSR',
        code: t.code,
        name: t.name,
        defaultCategory: t.category as any,
      },
    });
  }

  // 3 stakeholder groups. Find-or-create — no unique key on (tenantId,name)
  // in the schema, so we look up by name.
  const stakeholders: Array<{ name: string; type: 'INTERNAL' | 'EXTERNAL'; influence: number; interest: number }> = [
    { name: 'Employees', type: 'INTERNAL', influence: 5, interest: 5 },
    { name: 'Investors', type: 'EXTERNAL', influence: 5, interest: 4 },
    { name: 'Community', type: 'EXTERNAL', influence: 3, interest: 4 },
  ];
  for (const s of stakeholders) {
    const existing = await prisma.stakeholderGroup.findFirst({
      where: { tenantId, name: s.name },
    });
    if (!existing) {
      await prisma.stakeholderGroup.create({
        data: {
          tenantId,
          name: s.name,
          type: s.type as any,
          influenceScore: s.influence,
          interestScore: s.interest,
        },
      });
    }
  }

  // Materiality assessment matrix for FY2024-25 — 12 topics scored on
  // internal (management view) and external (stakeholder view) axes (1-5).
  const matrix = BRSR_MATERIAL_TOPICS.map((t, idx) => ({
    code: t.code,
    name: t.name,
    category: t.category,
    internalScore: 5 - ((idx * 3) % 5) * 0.3,
    externalScore: 4 - ((idx * 7) % 5) * 0.2,
  }));

  const priorityTopics = matrix
    .map((m) => ({ ...m, composite: m.internalScore + m.externalScore }))
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 6)
    .map((m) => ({ code: m.code, name: m.name }));

  // Find-or-create (no unique key on tenantId+fy in the schema).
  const existingRun = await prisma.materialityAssessmentRun.findFirst({
    where: { tenantId, fy: FY },
  });
  if (!existingRun) {
    await prisma.materialityAssessmentRun.create({
      data: {
        tenantId,
        fy: FY,
        matrixData: matrix as any,
        priorityTopics: priorityTopics as any,
      },
    });
  }

  console.log('materiality: 6 topics, 3 stakeholder groups, 1 assessment run');
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  console.log('--- BRSR v2 seed start ---');
  const tenant = await seedTenant();
  const entityIds = await seedHierarchy(tenant.id);
  const roleIds = await seedRoles(tenant.id);
  await seedUsers(tenant.id, roleIds, entityIds);
  await seedCanonicalMetrics();
  await seedFrameworkMappings();
  await seedEmissionFactors(tenant.id);
  await seedWorkflows(tenant.id);
  await seedMateriality(tenant.id);
  console.log('--- BRSR v2 seed complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
