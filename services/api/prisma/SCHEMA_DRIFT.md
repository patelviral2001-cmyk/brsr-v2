# Schema Drift Report

**Generated:** 2026-06-18
**Scope:** Differences between `prisma/schema.prisma`, `prisma/migrations/01_init/migration.sql`, and live API code under `services/api/src/`.

The `01_init/migration.sql` file does **not** contain `CREATE TABLE` statements — it is a follow-up script that applies post-table customisations (extensions, RLS, partitioning notes, hash-chain triggers, ltree conversion, composite indexes). Prisma's auto-generated `CREATE TABLE` boilerplate is expected to run *before* this file (per the comment at lines 1–17 of `migration.sql`). That means **every model in `schema.prisma` is implicitly part of the migration**, and any schema change made by editing `schema.prisma` and running `prisma db push` (without generating a new migration file) is undocumented in the migrations directory.

There is no `02_partitions.sql`, no `03_*.sql`, no `02_*` file at all. Anything added since the initial cut has been **pushed directly to the database via `prisma db push`** and is invisible to `prisma migrate deploy` in CI/CD.

---

## A. Schema → Migration drift (pushed via `prisma db push`, not in `01_init`)

The items below exist in `schema.prisma` (after this audit's edits) but have **no corresponding DDL** in any migration file. They will not be re-created on a fresh `prisma migrate deploy` until a new migration file is generated.

### A1. Indexes added in this audit that lack migration SQL

| Table | Index | Reason |
|---|---|---|
| `audit_log` | `(tenant_id, actor_user_id, created_at DESC)` | actor-scoped audit lookups |
| `audit_log` | `(tenant_id, action, created_at DESC)` | "show me all APPROVE events" |
| `audit_log` | `(request_id)` | cross-tenant trace id lookup for debugging |
| `entity_node` | `(tenant_id, deleted_at)` | soft-delete filter in hierarchy.service |
| `entity_node` | `(tenant_id, country)` | facility-by-country dashboard tile |
| `role_assignment` | `(expires_at)` | nightly job that revokes expired grants |
| `role_assignment` | UNIQUE `(user_id, role_id, scope_node_id)` | prevents duplicate grants |
| `api_key` | `(expires_at)` | rotation reaper |
| `ingest_event` | `(tenant_id, created_at DESC)` | dashboard recent activity |
| `ingest_event` | `(source_id, created_at DESC)` | per-connector audit |
| `ingest_event` | `(external_id)` | idempotency lookup |
| `document` | `(tenant_id, status, uploaded_at DESC)` | inbox-style listing |
| `document` | `(scope_node_id)` | reverse-FK lookup |
| `extraction_field` | `(tenant_id, status)` | groupBy queries in extraction.service.stats |
| `extraction_field` | `(tenant_id, reviewed_at DESC)` | "reviewed in last 24h" stat |
| `extraction_field` | `(document_id, canonical_key)` | per-doc dedup |
| `metric_event` | `(tenant_id, scope_node_id, canonical_key, period_start)` | combined filter from metrics.service.query |
| `metric_event` | `(tenant_id, status, period_start DESC)` | dashboards |
| `metric_event` | `(tenant_id, canonical_key, period_end DESC)` | latest-value lookups |
| `metric_event` | `(tenant_id, period_start, period_end)` | range overlap queries |
| `metric_event` | `(assurance_snapshot_id)` | reverse-FK |
| `metric_event` | `(source_extraction_id)` | lineage walk |
| `metric_event` | `(source_calc_run_id)` | lineage walk |
| `calc_run` | `(tenant_id, computed_at DESC)` | recent runs view |
| `calc_run` | `(formula_version_id)` | formula impact analysis |
| `workflow_instance` | `(tenant_id, status, sla_deadline)` | overdue-approvals worker |
| `workflow_instance` | `(workflow_id)` | reverse-FK |
| `approval_action` | `(workflow_instance_id, step)` | step replay |
| `approval_action` | `(performed_by, performed_at DESC)` | per-user audit |
| `assurance_snapshot` | UNIQUE `(tenant_id, fy, framework, snapshot_at)` | dedup snapshots |
| `assurance_snapshot` | `(tenant_id, status, snapshot_at DESC)` | active-snapshot listing |
| `assurance_snapshot` | `(parent_snapshot_id)` | supersession chain |
| `audit_exception` | `(snapshot_id, status)`, `(snapshot_id, severity)`, `(metric_event_id)` | exception triage |
| `report` | UNIQUE `(tenant_id, fy, framework, version)` | replaces non-unique sort index |
| `report` | `(tenant_id, status, generated_at DESC)` | published-report feed |
| `report` | `(parent_report_id)` | version chain |
| `supplier` | UNIQUE `(tenant_id, primary_contact_email)` | one supplier per contact |
| `supplier` | `(tenant_id, country)`, `(tenant_id, sector)` | filter dashboard |
| `supplier_invite` | `(supplier_id, expires_at)`, `(questionnaire_id)`, `(expires_at)` | reaper + lookups |
| `supplier_response` | `(supplier_id, submitted_at DESC)`, `(questionnaire_id)`, `(status)` | latest-response queries |
| `materiality_survey` | UNIQUE `(tenant_id, fy, title)` + `(tenant_id, status)` | dedup + filtering |
| `materiality_assessment_run` | UNIQUE `(tenant_id, fy)` + `(tenant_id, locked_at)` | one run per fy |
| `survey_response` | UNIQUE `(survey_id, respondent_email)` | one response per respondent |
| `survey_response` | `(stakeholder_group_id)` | reverse-FK |
| `emission_factor` | `(source, activity_type, region, gas, valid_from DESC)`, `(valid_from, valid_to)` | factor lookup with effective-date |
| `sbti_target` | `(tenant_id, status)`, `(tenant_id, scope, target_year)` | progress dashboards |
| `abatement_project` | `(tenant_id, status)`, `(tenant_id, start_date, end_date)` | MACC chart |
| `carbon_credit` | `(tenant_id, vintage DESC)`, `(tenant_id, retired_on)` | retirement ledger |
| `copilot_conversation` | `(tenant_id, last_message_at DESC)` | tenant-wide recents |
| `copilot_message` | `(conversation_id, role, created_at)` | system-message filter |

### A2. Foreign key behaviour changes

The following `onDelete` clauses were added or hardened. The original migration relied on Prisma's default (`NoAction` for optional, `Restrict` for required), which silently differs from the intent expressed elsewhere in the codebase.

| Relation | Before | After | Reason |
|---|---|---|---|
| `RoleAssignment.scopeNode` | (default) | `SetNull` | scopeNodeId is nullable; deleting a node should not delete the grant |
| `EntityNode.parent` | (default) | `Restrict` | block accidental subtree wipe |
| `Document.scopeNode` | `Cascade` | `Restrict` | preserve evidence even if a node is purged |
| `MetricEvent.scopeNode` | `Cascade` | `Restrict` | metric history must outlive a hierarchy move |
| `WorkflowInstance.workflow` | `Cascade` | `Restrict` | active approvals must survive workflow template edits |
| `SurveyResponse.stakeholderGroup` | (default) | `SetNull` | stakeholder groups are reorganised over time |
| `SupplierInvite.questionnaire` | `Cascade` | `Restrict` | preserve invite history |
| `SupplierResponse.questionnaire` | `Cascade` | `Restrict` | preserve response history |

### A3. Enum value additions

Existing rows are unaffected, but `prisma db push` will need to run before code that emits the new values:

- `DocStatus`: added `UPLOADED`, `EXTRACTION_FAILED`, `PARTIAL`, `NEEDS_REVIEW`
- `MetricStatus`: added `REJECTED`
- `ExtractionStatus`: added `AUTO_ACCEPTED`
- `AuditExceptionStatus`: added `IN_REVIEW`
- `ReportStatus`: added `GENERATING`, `GENERATED`
- `SupplierStatus`: added `ACTIVE`

### A4. New scalar columns

- `ApiKey.revokedAt` — added; code path for key rotation referenced this but column was absent.

---

## B. Code → Schema drift (code references entities NOT in `schema.prisma`)

These are the hard, system-breaking drifts. The API services were written against a schema vocabulary that diverges from the committed `schema.prisma`. The code compiles only because every call site uses `(this.prisma as any).<model>`, which suppresses TypeScript checking. At runtime, Prisma will raise `Unknown arg` / `Unknown model` errors unless these models/columns have been pushed to the live DB out-of-band.

### B1. Models referenced in code but **missing** from `schema.prisma`

| Code reference | File | Likely intent |
|---|---|---|
| `prisma.hierarchyNode` | `hierarchy/hierarchy.service.ts` (12 hits), `graphql/dashboard.resolver.ts:80` | renamed `entity_node` → `hierarchy_node` in code, not in schema |
| `prisma.survey` | `materiality/materiality.service.ts` | maps to `materiality_survey` in schema; code uses short name |
| `prisma.surveyInvitation` | `materiality/materiality.service.ts:120,158` | no equivalent in schema |
| `prisma.surveyScore` | `materiality/materiality.service.ts:225` | no equivalent |
| `prisma.materialityTopic` | `materiality/materiality.service.ts` | schema has `material_topic`; code uses different camelCase |
| `prisma.stakeholder` | `materiality/materiality.service.ts:53,57` | schema has `stakeholder_group` |
| `prisma.assessmentRun` | `materiality/materiality.service.ts:283,305,313` | schema has `materiality_assessment_run` |
| `prisma.formula` | `calculations/calculations.service.ts`, `calculation.processor.ts:43` | no model exists |
| `prisma.metricRegistry` | `calculations/`, `metrics/metrics.service.ts`, `post-extraction.processor.ts` | schema has `canonical_metric` |
| `prisma.calcStep` | `calculation.processor.ts:107` | no model exists |
| `prisma.supplierInvitation` | `suppliers/suppliers.service.ts` (3 hits) | schema has `supplier_invite` |
| `prisma.supplierScorecard` | `suppliers/suppliers.service.ts:210,233` | schema has `supplier_score` (different shape) |
| `prisma.supplierQuestion` | `suppliers/suppliers.service.ts:197` | no model exists; `supplier_questionnaire.sections` is `Json` |
| `prisma.assuranceSnapshotItem` | `assurance/assurance.service.ts:92,126` | no model exists |
| `prisma.assuranceException` | `assurance/assurance.service.ts:158,165,189,191` | schema has `audit_exception` |
| `prisma.brsrMapping` | `brsr/brsr.service.ts:29,50`, `assurance.service.ts:102` | schema has `framework_mapping` |
| `prisma.nodeMetricsSnapshot` | `hierarchy/hierarchy.service.ts:336` | denormalised projection — no model exists |
| `prisma.auditAnchor` | `audit/audit.service.ts:139,145` | Merkle anchoring table — no model exists |
| `prisma.anomalyFlag` | `graphql/dashboard.resolver.ts:112` | no model exists |

### B2. Columns referenced in code but **missing** from `schema.prisma`

| Model | Column | Code site |
|---|---|---|
| `Document` | `lastError`, `extractedAt`, `confidenceComposite`, `uploaderBy` | `files/files.service.ts:281,313,344` |
| `Supplier` | `deletedAt`, `contactEmail`, `createdAt` | `suppliers/suppliers.service.ts:25,72,85` (schema has `addedAt`, `primaryContactEmail`) |
| `DataSource` | `deletedAt`, `kind`, `lastTestAt`, `lastTestOk` | `data-sources/data-sources.service.ts:65,84,87` (schema field is `type` not `kind`) |
| `MetricEvent` | `deletedAt`, `documentId`, `extractionFieldId`, `notes`, `metadata`, `source`, `createdBy`, `rejectedAt`, `rejectedBy`, `rejectionReason`, `lockedAt`, `lockedBy` | `metrics/metrics.service.ts` (many); schema has `sourceType`, `sourceExtractionId`, `submittedBy` only |
| `EntityNode` (`hierarchyNode` in code) | `deletedAt`, `region`, `latitude`, `longitude` | `hierarchy/hierarchy.service.ts` (schema has `lat`/`lng`/`state`) |
| `Report` | `approvedAt`, `approvalNotes` | `reports/reports.service.ts:48` |
| `ExtractionField` | `confidence`, `fieldKey`, `value`, `pageNumber`, `bbox`, `evidenceText`, `validationNotes`, `reviewerNotes` | `extraction/extraction.service.ts`, `files.service.ts:323-330`; schema uses `confidenceComposite`, `canonicalKey`, `valueText`/`valueNum`, `sourcePage`, `sourceBbox`, `rawText`, `overrideReason` |
| `AuditLog` | `entity` (vs schema `entityType`), `userId` (vs `actorUserId`) | `audit/audit.service.ts:73-77` |
| `MaterialTopic` | `group` (used in orderBy) | `materiality.service.ts:53` |

### B3. Enum value usage in code that did NOT exist in `schema.prisma` before this audit

| Enum | Value used in code | File |
|---|---|---|
| `DocStatus` | `UPLOADED`, `EXTRACTION_FAILED`, `PARTIAL`, `NEEDS_REVIEW` | `files/files.service.ts:281,313,330,338-343` |
| `MetricStatus` | `REJECTED` | `metrics/metrics.service.ts:197` |
| `ExtractionStatus` | `AUTO_ACCEPTED` | `files/files.service.ts:330`, `extraction.service.ts:28` |
| `AuditExceptionStatus` | `IN_REVIEW` | `assurance/assurance.service.ts:197` |
| `ReportStatus` | `GENERATING`, `GENERATED` | `brsr/brsr.service.ts:166`, `brsr-report.processor.ts:83` |
| `SupplierStatus` | `ACTIVE` | `suppliers/suppliers.service.ts:42` |
| `DataSource.status` (no enum exists) | `CONFIGURED` | `data-sources/data-sources.service.ts:35` — schema has no `status` column on `DataSource` |
| Calc-run status (no enum exists) | `RUNNING`, `QUEUED`, `COMPLETED`, `FAILED`, `SUCCESS`, `ERROR` | `calculation.processor.ts`; schema has no `status` column on `CalcRun` |

This audit added the enum values listed in section A3 to align the schema with code. The new values are additive and safe; existing rows do not need to be migrated.

---

## C. Migration-only customisations NOT expressible in `schema.prisma`

The following are correctly captured in `01_init/migration.sql` and have **no drift**:

- pgcrypto, ltree, pg_trgm, citext, btree_gin extensions
- `entity_node.ltree_path` TEXT → `ltree` conversion + GiST index
- pg_trgm fuzzy GIN indexes on `supplier.name`, `document.original_name`, `entity_node.name`
- Row-Level Security policies + `current_tenant_id()`, `rls_bypass()` helpers
- `audit_log` hash-chain BEFORE INSERT trigger + immutability triggers
- Partial index: `extraction_field_low_confidence_idx` (WHERE status IN draft/needs_review)
- Partial index: `supplier_active_idx` (WHERE status != 'ARCHIVED')

## D. Partitioning gap

`01_init/migration.sql` lines 504–520 explicitly **defer** partitioning to a `02_partitions` migration that **does not exist on disk**. Per the comment:

- `metric_event` should be `PARTITION BY HASH (tenant_id)` × 32 partitions, sub-partitioned `RANGE (period_start)` yearly back to 2018.
- `audit_log` should be `PARTITION BY RANGE (created_at)`, monthly, with a 24-month rolling window and an `archive_audit_log` cold table.

In production today, both tables are unpartitioned heaps. At the projected ingest volume (low-millions of rows/year/tenant for `metric_event` and tens-of-millions/year for `audit_log` across all tenants) this will become a `vacuum` and index-bloat hazard within 12 months. **Required:** generate `02_partitions/migration.sql` before next major release.

---

## E. Recommended remediation order

1. Generate a fresh Prisma migration capturing **all** schema edits in section A: `pnpm prisma migrate dev --name 02_post_audit_indexes_and_enums --create-only`, then hand-edit to add the partial-index DDL and review FK changes for online-safety on existing tables.
2. Author `02_partitions/migration.sql` per section D.
3. Open a separate ticket to reconcile section B (code ↔ schema rename drift). Either rename models in schema to match code or refactor services to match schema. **Until then, the API will throw `Unknown model` at runtime on any of the missing models.**
4. Remove `(this.prisma as any)` casts once schema is the source of truth — restores compile-time safety.
