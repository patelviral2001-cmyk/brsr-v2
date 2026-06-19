/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * THE ESG — seed
 *
 * Boots a fresh database with:
 *   - 1 demo tenant (Imagine Powertree)
 *   - 6 sites
 *   - 1 admin user (admin@theesg.in / Admin@1234)
 *   - 1 sustainability manager (priya@theesg.in / Priya@1234)
 *   - the full ESG ontology for v1: 9 topics + 15 KPIs
 *   - BRSR standard + 10 disclosures linked to KPIs
 *
 * Idempotent. Re-runs do not duplicate.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedOntology() {
  const topics = [
    { code: 'ENERGY',      title: 'Energy',          pillar: 'E', sortKey: 10 },
    { code: 'EMISSIONS',   title: 'Emissions',       pillar: 'E', sortKey: 20 },
    { code: 'WATER',       title: 'Water',           pillar: 'E', sortKey: 30 },
    { code: 'WASTE',       title: 'Waste',           pillar: 'E', sortKey: 40 },
    { code: 'WORKFORCE',   title: 'Workforce',       pillar: 'S', sortKey: 50 },
    { code: 'DIVERSITY',   title: 'Diversity',       pillar: 'S', sortKey: 60 },
    { code: 'TRAINING',    title: 'Training',        pillar: 'S', sortKey: 70 },
    { code: 'GOVERNANCE',  title: 'Governance',      pillar: 'G', sortKey: 80 },
    { code: 'ETHICS',      title: 'Ethics',          pillar: 'G', sortKey: 90 },
  ];
  const topicByCode = new Map<string, string>();
  for (const t of topics) {
    const row = await prisma.esgTopic.upsert({
      where: { code: t.code },
      update: { title: t.title, pillar: t.pillar, sortKey: t.sortKey },
      create: t,
    });
    topicByCode.set(t.code, row.id);
  }

  const kpis = [
    // Environment — Energy
    { code: 'grid_electricity_kwh',         title: 'Grid electricity consumption',     topic: 'ENERGY',    kind: 'QUANTITATIVE', unit: 'kWh',  mat: 'LEAF',      agg: 'SUM' },
    { code: 'diesel_stationary_l',          title: 'Diesel (stationary combustion)',   topic: 'ENERGY',    kind: 'QUANTITATIVE', unit: 'L',    mat: 'LEAF',      agg: 'SUM' },
    { code: 'png_consumed_m3',              title: 'PNG (natural gas) consumption',    topic: 'ENERGY',    kind: 'QUANTITATIVE', unit: 'm3',   mat: 'LEAF',      agg: 'SUM' },
    { code: 'total_energy_gj',              title: 'Total energy consumed',            topic: 'ENERGY',    kind: 'QUANTITATIVE', unit: 'GJ',   mat: 'DERIVED',   agg: null,  formula: { expression: 'elec_kwh * 0.0036 + diesel_l * 0.0386 + ng_m3 * 0.038', binds: [{ name: 'elec_kwh', from_kpi: 'grid_electricity_kwh' }, { name: 'diesel_l', from_kpi: 'diesel_stationary_l' }, { name: 'ng_m3', from_kpi: 'png_consumed_m3' }] } },
    // Environment — Emissions (calc later)
    { code: 'ghg_scope2_location_tco2e',    title: 'Scope 2 emissions (location-based)', topic: 'EMISSIONS', kind: 'QUANTITATIVE', unit: 'tCO2e', mat: 'DERIVED', agg: null, formula: { expression: 'elec_kwh * 0.000716', binds: [{ name: 'elec_kwh', from_kpi: 'grid_electricity_kwh' }] } },
    // Environment — Water
    { code: 'water_withdrawal_m3',          title: 'Water withdrawal',                 topic: 'WATER',     kind: 'QUANTITATIVE', unit: 'm3',   mat: 'LEAF',      agg: 'SUM' },
    // Environment — Waste
    { code: 'waste_hazardous_t',            title: 'Hazardous waste',                  topic: 'WASTE',     kind: 'QUANTITATIVE', unit: 't',    mat: 'LEAF',      agg: 'SUM' },
    { code: 'waste_non_hazardous_t',        title: 'Non-hazardous waste',              topic: 'WASTE',     kind: 'QUANTITATIVE', unit: 't',    mat: 'LEAF',      agg: 'SUM' },
    // Social — Workforce
    { code: 'headcount_total',              title: 'Total headcount',                  topic: 'WORKFORCE', kind: 'QUANTITATIVE', unit: 'employees', mat: 'LEAF', agg: 'LATEST' },
    // Social — Diversity
    { code: 'women_in_workforce_pct',       title: 'Women in workforce',               topic: 'DIVERSITY', kind: 'PROPORTION',   unit: '%',    mat: 'LEAF',      agg: 'LATEST' },
    { code: 'women_on_board_pct',           title: 'Women on Board',                   topic: 'DIVERSITY', kind: 'PROPORTION',   unit: '%',    mat: 'LEAF',      agg: 'LATEST' },
    // Social — Training
    { code: 'training_hours_total',         title: 'Training hours (total)',           topic: 'TRAINING',  kind: 'QUANTITATIVE', unit: 'hours', mat: 'LEAF',     agg: 'SUM' },
    // Governance
    { code: 'independent_directors_pct',    title: 'Independent directors on Board',   topic: 'GOVERNANCE',kind: 'PROPORTION',   unit: '%',    mat: 'LEAF',      agg: 'LATEST' },
    { code: 'board_meetings_count',         title: 'Board meetings held in the year',  topic: 'GOVERNANCE',kind: 'QUANTITATIVE', unit: 'count', mat: 'LEAF',     agg: 'SUM' },
    { code: 'ethics_cases_count',           title: 'Ethics cases raised',              topic: 'ETHICS',    kind: 'EVENT_LIST',   unit: 'cases', mat: 'LEAF',     agg: 'COUNT' },
  ];

  const kpiByCode = new Map<string, string>();
  for (const k of kpis) {
    const row = await prisma.kpi.upsert({
      where: { code: k.code },
      update: {
        title: k.title,
        topicId: topicByCode.get(k.topic)!,
        payloadKind: k.kind,
        unit: k.unit,
        materializationKind: k.mat,
        aggregation: k.agg,
        formula: (k as any).formula ?? null,
      },
      create: {
        code: k.code,
        title: k.title,
        topicId: topicByCode.get(k.topic)!,
        payloadKind: k.kind,
        unit: k.unit,
        materializationKind: k.mat,
        aggregation: k.agg,
        formula: (k as any).formula ?? null,
      },
    });
    kpiByCode.set(k.code, row.id);
  }

  // Standards
  const brsr = await prisma.standard.upsert({
    where: { code: 'BRSR' },
    update: { title: 'Business Responsibility and Sustainability Report', version: '2024' },
    create: { code: 'BRSR', title: 'Business Responsibility and Sustainability Report', version: '2024' },
  });

  const disclosures = [
    { code: 'P6-Q1.a',  section: 'Principle 6 — Environment',  question: 'Total energy consumed (in GJ) by the entity',           kpi: 'total_energy_gj' },
    { code: 'P6-Q6',    section: 'Principle 6 — Environment',  question: 'Grid electricity consumption (kWh)',                     kpi: 'grid_electricity_kwh' },
    { code: 'P6-Q5',    section: 'Principle 6 — Environment',  question: 'Stationary combustion — diesel (L)',                     kpi: 'diesel_stationary_l' },
    { code: 'P6-Q3.a',  section: 'Principle 6 — Environment',  question: 'Water withdrawal',                                       kpi: 'water_withdrawal_m3' },
    { code: 'P6-Q7',    section: 'Principle 6 — Environment',  question: 'Hazardous waste generated',                              kpi: 'waste_hazardous_t' },
    { code: 'P3-Q1.a',  section: 'Principle 3 — Employee well-being', question: 'Total employees',                                 kpi: 'headcount_total' },
    { code: 'P3-Q1.b',  section: 'Principle 3 — Employee well-being', question: 'Women in workforce (%)',                          kpi: 'women_in_workforce_pct' },
    { code: 'P5-Q3',    section: 'Principle 5 — Human rights',  question: 'Training hours per FY',                                  kpi: 'training_hours_total' },
    { code: 'P1-Q2',    section: 'Principle 1 — Ethics',         question: 'Independent directors on Board (%)',                    kpi: 'independent_directors_pct' },
    { code: 'P1-Q1.b',  section: 'Principle 1 — Ethics',         question: 'Number of Board meetings',                              kpi: 'board_meetings_count' },
  ];
  for (const d of disclosures) {
    await prisma.disclosure.upsert({
      where: { standardId_code: { standardId: brsr.id, code: d.code } },
      update: { section: d.section, questionText: d.question, kpiId: kpiByCode.get(d.kpi)! },
      create: { standardId: brsr.id, code: d.code, section: d.section, questionText: d.question, kpiId: kpiByCode.get(d.kpi)! },
    });
  }
}

async function seedDemoTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'imagine-powertree' },
    update: { name: 'Imagine Powertree Group' },
    create: { name: 'Imagine Powertree Group', slug: 'imagine-powertree', brandColor: '#A8E10C' },
  });

  const re = await prisma.reportingEntity.upsert({
    where: { tenantId_cinOrLlpin: { tenantId: tenant.id, cinOrLlpin: 'U40300MH2018PTC000001' } },
    update: { name: 'Imagine Powertree Group' },
    create: { tenantId: tenant.id, name: 'Imagine Powertree Group', cinOrLlpin: 'U40300MH2018PTC000001', listed: true },
  });

  const sites = [
    { code: 'DARODA',    name: 'Daroda Toll Plaza',       siteType: 'TOLL_PLAZA',      state: 'Maharashtra', district: 'Nagpur' },
    { code: 'AJANTI',    name: 'Ajanti Street Lights',    siteType: 'STREET_LIGHTING', state: 'Maharashtra', district: 'Pune' },
    { code: 'BRAMHNI',   name: 'Bramhni Street Lights',   siteType: 'STREET_LIGHTING', state: 'Maharashtra', district: 'Pune' },
    { code: 'BARBADI',   name: 'Barbadi Street Lights',   siteType: 'STREET_LIGHTING', state: 'Maharashtra', district: 'Pune' },
    { code: 'CHIMANAZARI', name: 'Chimanazari Street Lights', siteType: 'STREET_LIGHTING', state: 'Maharashtra', district: 'Aurangabad' },
    { code: 'MUMBAI_HQ', name: 'Mumbai HQ',               siteType: 'OFFICE',          state: 'Maharashtra', district: 'Mumbai' },
  ];
  for (const s of sites) {
    await prisma.site.upsert({
      where: { tenantId_externalCode: { tenantId: tenant.id, externalCode: s.code } },
      update: { name: s.name, siteType: s.siteType, state: s.state, district: s.district, reportingEntityId: re.id },
      create: { tenantId: tenant.id, externalCode: s.code, name: s.name, siteType: s.siteType, state: s.state, district: s.district, reportingEntityId: re.id },
    });
  }

  // Admin role + users
  const allPermissions = [
    'site.read', 'site.write', 'site.delete',
    'evidence.read', 'evidence.upload', 'evidence.review',
    'datapoint.read', 'datapoint.write', 'datapoint.confirm', 'datapoint.lock',
    'kpi.read', 'kpi.write',
    'report.read', 'report.write', 'report.approve', 'report.file',
    'audit.read', 'user.read', 'user.invite', 'user.update',
  ];
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'ADMIN' } },
    update: { permissions: allPermissions, isSystem: true },
    create: { tenantId: tenant.id, name: 'ADMIN', permissions: allPermissions, isSystem: true, description: 'Full access' },
  });
  const smRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'SUSTAINABILITY_MANAGER' } },
    update: {
      permissions: ['site.read', 'evidence.read', 'evidence.upload', 'evidence.review', 'datapoint.read', 'datapoint.write', 'datapoint.confirm', 'kpi.read', 'report.read', 'audit.read'],
      isSystem: true,
    },
    create: {
      tenantId: tenant.id, name: 'SUSTAINABILITY_MANAGER', isSystem: true, description: 'Sustainability Manager',
      permissions: ['site.read', 'evidence.read', 'evidence.upload', 'evidence.review', 'datapoint.read', 'datapoint.write', 'datapoint.confirm', 'kpi.read', 'report.read', 'audit.read'],
    },
  });

  const adminPasswordHash = await bcrypt.hash('Admin@1234', 10);
  const admin = await prisma.user.upsert({
    where: { idpSubject: 'local:admin@theesg.in' },
    update: { passwordHash: adminPasswordHash, isActive: true, firstName: 'THE', lastName: 'ESG Admin' },
    create: { tenantId: tenant.id, idpSubject: 'local:admin@theesg.in', email: 'admin@theesg.in', firstName: 'THE', lastName: 'ESG Admin', passwordHash: adminPasswordHash },
  });
  const smPasswordHash = await bcrypt.hash('Priya@1234', 10);
  const sm = await prisma.user.upsert({
    where: { idpSubject: 'local:priya@theesg.in' },
    update: { passwordHash: smPasswordHash, isActive: true, firstName: 'Priya', lastName: 'Shah' },
    create: { tenantId: tenant.id, idpSubject: 'local:priya@theesg.in', email: 'priya@theesg.in', firstName: 'Priya', lastName: 'Shah', passwordHash: smPasswordHash },
  });

  for (const [user, r] of [[admin, role], [sm, smRole]] as const) {
    const existing = await prisma.roleAssignment.findFirst({ where: { userId: user.id, roleId: r.id } });
    if (!existing) {
      await prisma.roleAssignment.create({ data: { userId: user.id, roleId: r.id, grantedBy: admin.id } });
    }
  }
}

async function main() {
  console.log('Seeding THE ESG ontology …');
  await seedOntology();
  console.log('Seeding demo tenant …');
  await seedDemoTenant();
  console.log('Done.');
  console.log('  Admin :  admin@theesg.in / Admin@1234');
  console.log('  SM    :  priya@theesg.in / Priya@1234');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
