# Database Audit — BRSR AI v2

**Date:** 2026-06-18
**Scope:** `services/api/prisma/schema.prisma`, `services/api/prisma/migrations/01_init/migration.sql`, all Prisma usage under `services/api/src/`.
**Auditor:** Staff DBA review.

---

## 1. Findings

### CRITICAL

#### F-01 (CRITICAL) — Code references many models and columns that do not exist in `schema.prisma`
Twenty-plus service files use `(this.prisma as any).<model>` to call Prisma client methods on models the generated client cannot have:
- `hierarchyNode`, `survey`, `surveyInvitation`, `surveyScore`, `materialityTopic`, `stakeholder`, `assessmentRun`, `formula`, `metricRegistry`, `calcStep`, `supplierInvitation`, `supplierScorecard`, `supplierQuestion`, `assuranceSnapshotItem`, `assuranceException`, `brsrMapping`, `nodeMetricsSnapshot`, `auditAnchor`, `anomalyFlag`.

The `as any` cast suppresses compile-time errors; the result is a **runtime time-bomb**. Every endpoint that touches one of these models will throw `PrismaClientKnownRequestError: Unknown arg / Unknown model` against the schema as committed. The only way this code can be working in any environment is if a different schema (with these models) has been pushed via `prisma db push` directly and never captured in a migration file.

Full inventory in `services/api/prisma/SCHEMA_DRIFT.md` §B.

#### F-02 (CRITICAL) — Enum drift: code emits status strings the schema enum does not allow
Eight distinct enum values used in code were missing from the schema (`DocStatus.UPLOADED`, `EXTRACTION_FAILED`, `PARTIAL`, `NEEDS_REVIEW`; `MetricStatus.REJECTED`; `ExtractionStatus.AUTO_ACCEPTED`; `AuditExceptionStatus.IN_REVIEW`; `ReportStatus.GENERATING`, `GENERATED`; `SupplierStatus.ACTIVE`). Postgres will reject the INSERT/UPDATE with `invalid input value for enum`. Code under `files/files.service.ts`, `metrics/metrics.service.ts`, `assurance/assurance.service.ts`, `brsr/brsr.service.ts`, and `suppliers/suppliers.service.ts` is affected.

#### F-03 (CRITICAL) — `metric_event` and `audit_log` are unpartitioned despite comments saying otherwise
`01_init/migration.sql` lines 504–520 declare partitioning is "deferred to `02_partitions`", but no such migration file exists. At a projected ingest of millions of `metric_event` rows and tens-of-millions of `audit_log` rows per year, the unpartitioned heap will:
- explode `vacuum` durations,
- defeat the per-tenant locality the hash-chain trigger assumes,
- prevent the 24-month rolling retention strategy described in the comment.

This is the single biggest scaling risk on the audit.

### HIGH

#### F-04 (HIGH) — `metric_event` missing the composite index claimed by the brief
The brief asserts the three indexes `(tenant_id, canonical_key, period_start)`, `(tenant_id, scope_node_id, period_start)`, `(tenant_id, status)` are present. They are, but the most common query pattern from `metrics/metrics.service.ts:91-105` filters on `(tenantId, canonicalKey, scopeNodeId IN […], periodStart/periodEnd, status)` — none of the three claimed indexes covers it efficiently. Added `(tenant_id, scope_node_id, canonical_key, period_start)` and `(tenant_id, status, period_start DESC)`.

#### F-05 (HIGH) — `document` missing `(tenant_id, status, uploaded_at DESC)`
Brief specifically asks to verify this index. It was absent. The inbox listing in `files/files.service.ts:233-247` orders by `uploadedAt desc` with an optional status filter; the existing `(tenant_id, uploaded_at DESC)` is fine when status is null, but on a status-filtered query Postgres has to sort. Added the 3-column index.

#### F-06 (HIGH) — `workflow_instance` lacks SLA-deadline index
`(tenant_id, status, sla_deadline)` is the natural query for the overdue-approvals worker. Without it, the worker must seq-scan + sort across the entire tenant's instance table on every tick.

#### F-07 (HIGH) — FK `Document.scopeNode` was `Cascade`; deleting an `EntityNode` would silently wipe all its evidence
Hardened to `Restrict`. Same problem on `MetricEvent.scopeNode` and `WorkflowInstance.workflow` — both fixed.

#### F-08 (HIGH) — `RoleAssignment.scopeNode` had no `onDelete` declared
Prisma defaults a nullable FK to `NoAction` which is effectively `Restrict` at the DB. Hardened to `SetNull`: deleting a scope node should leave the grant in place but un-scoped (the caller can then revoke or reassign). Also added a `UNIQUE (user_id, role_id, scope_node_id)` constraint — duplicate grants were silently allowed.

#### F-09 (HIGH) — `audit_log` had no actor-scoped index
Forensic queries like "every action by user X" required a full scan on a table designed to hit billions of rows. Added `(tenant_id, actor_user_id, created_at DESC)`, `(tenant_id, action, created_at DESC)`, and `(request_id)` for cross-tenant trace lookups.

#### F-10 (HIGH) — `report` had no unique constraint on its natural key
The existing index `(tenantId, fy, framework, version)` was a plain index, not a unique. Two concurrent `generate report` calls could insert duplicate (fy, framework, version=1) rows. Promoted to `@@unique`.

#### F-11 (HIGH) — `materiality_assessment_run` allowed multiple runs per FY
Business invariant: one signed/locked run per fiscal year. Schema had no unique constraint. Added `@@unique([tenantId, fy])`.

#### F-12 (HIGH) — `audit_exception.status` enum cannot store value the code writes
`assurance.service.ts:197` writes `'IN_REVIEW'`; schema enum has only `OPEN, RESPONDED, CLOSED`. Added.

### MEDIUM

#### F-13 (MEDIUM) — `entity_node` missing `(tenant_id, deleted_at)` index
The soft-delete pattern is pervasive (`hierarchy/hierarchy.service.ts` line 55, 122, 165, 229, 274) but no index supports it. Every list operation re-scanned.

#### F-14 (MEDIUM) — `extraction_field` missing `(tenant_id, status)` for groupBy
`extraction/extraction.service.ts:137-142` does `groupBy({ by: ['status'], where: { tenantId } })`. Existing `(tenantId, status, confidence_composite)` works as a prefix but the planner often prefers a narrower index for groupBy.

#### F-15 (MEDIUM) — `emission_factor` lookup query not covered
The natural lookup is `WHERE source=$1 AND activity_type=$2 AND region=$3 AND gas=$4 AND valid_from <= $5 AND (valid_to IS NULL OR valid_to > $5)`. The existing 4-column index omits `gas`. Added `(source, activity_type, region, gas, valid_from DESC)` and `(valid_from, valid_to)` for retire-old-factors maintenance.

#### F-16 (MEDIUM) — `supplier_invite` and `supplier_response` had no `expires_at` / `submitted_at` indexes
Invite-reaper job scans by `expires_at`; latest-response query orders by `submitted_at desc`. Both unindexed.

#### F-17 (MEDIUM) — `carbon_credit` retirement queries unindexed
Reports filter `retired_on IS NULL` or aggregate by vintage. Added `(tenant_id, vintage DESC)` and `(tenant_id, retired_on)`.

#### F-18 (MEDIUM) — `survey_response` allowed the same respondent to submit multiple times for one survey
Business intent in `materiality.service.ts` treats one response per respondent_email per survey. Schema allowed duplicates. Added `@@unique([surveyId, respondentEmail])`.

#### F-19 (MEDIUM) — `supplier` missing `(tenant_id, primary_contact_email)` uniqueness
Same email + same tenant should be one supplier; without the unique constraint, the invite mailer can dispatch to a phantom duplicate.

#### F-20 (MEDIUM) — `api_key` missing `(expires_at)` index for rotation reaper
Daily job that revokes expired keys had no supporting index.

#### F-21 (MEDIUM) — Several reverse-FK lookups had no index
`metric_event.assurance_snapshot_id`, `metric_event.source_extraction_id`, `metric_event.source_calc_run_id`, `audit_exception.metric_event_id`, `assurance_snapshot.parent_snapshot_id`, `report.parent_report_id`, `workflow_instance.workflow_id`, `survey_response.stakeholder_group_id`, `calc_run.formula_version_id`. All added. Without these, `DELETE` on the parent row degenerates into a full scan on the child to check FKs.

### LOW

#### F-22 (LOW) — `ApiKey.revokedAt` column missing
Rotation flow references a `revokedAt` column in the audit narrative; added the nullable column for symmetry with `lastUsedAt` / `expiresAt`.

#### F-23 (LOW) — `materiality_survey` allowed duplicate `(tenantId, fy, title)`
Added unique.

#### F-24 (LOW) — `assurance_snapshot` had no uniqueness guard
Two concurrent snapshot creations for the same `(tenant, fy, framework, snapshot_at)` would silently coexist. Added unique.

#### F-25 (LOW) — Decimal precision check — passes for emissions values
Brief asked for ≥10 decimals on emission-bearing columns. Verified:
- `metric_event.value Decimal(38, 12)` — OK
- `emission_factor.value Decimal(38, 12)` — OK
- `extraction_field.value_num Decimal(38, 12)` — OK
- `calc_run.output_value Decimal(38, 12)` — OK
- `sbti_target.baseline_value Decimal(38, 12)` — OK
Monetary columns (`revenue`, `spend_inr`, `capex`, `opex`, `marginal_abatement_cost`) use `Decimal(38, 2)` which is correct for currency. `carbon_credit.quantity_tco2 / price_per_tco2 Decimal(38, 4)` is fine. **No precision fixes were required.**

#### F-26 (LOW) — `entity_node.ltree_path` is declared `String?` in Prisma
This is documented in a comment (lines 539–542) — the column is promoted to real `ltree` type by `01_init/migration.sql` and Prisma's client treats it as a string at runtime. **Verified working as intended; no fix.**

#### F-27 (LOW) — RLS check
Every tenant-scoped table has `ENABLE + FORCE ROW LEVEL SECURITY` with isolation policies driven by `current_tenant_id()`. **Verified correct; no fix.**

---

## 2. Fixes Applied

All fixes live in `C:\Users\admin\brsr-v2\services\api\prisma\schema.prisma`.

| # | Model | Change |
|---|---|---|
| 1 | `RoleAssignment` | `scopeNode` relation `onDelete: SetNull`; added `@@unique([userId, roleId, scopeNodeId])`; added `(expiresAt)` index |
| 2 | `ApiKey` | added `revokedAt` column and `(expiresAt)` index |
| 3 | `AuditLog` | added `(tenantId, actorUserId, createdAt DESC)`, `(tenantId, action, createdAt DESC)`, `(requestId)` indexes |
| 4 | `EntityNode` | `parent` relation `onDelete: Restrict`; added `(tenantId, deletedAt)`, `(tenantId, country)` indexes |
| 5 | `SurveyResponse` | `stakeholderGroup` relation `onDelete: SetNull`; added `@@unique([surveyId, respondentEmail])`; added `(stakeholderGroupId)` index |
| 6 | `MaterialitySurvey` | added `@@unique([tenantId, fy, title])` and `(tenantId, status)` |
| 7 | `MaterialityAssessmentRun` | added `@@unique([tenantId, fy])` and `(tenantId, lockedAt)` |
| 8 | `IngestEvent` | added `(tenantId, createdAt DESC)`, `(sourceId, createdAt DESC)`, `(externalId)` |
| 9 | `Document` | `scopeNode` `onDelete: Restrict`; added `(tenantId, status, uploadedAt DESC)`, `(scopeNodeId)` |
| 10 | `ExtractionField` | added `(tenantId, status)`, `(tenantId, reviewedAt DESC)`, `(documentId, canonicalKey)` |
| 11 | `MetricEvent` | `scopeNode` `onDelete: Restrict`; added `(tenantId, scopeNodeId, canonicalKey, periodStart)`, `(tenantId, status, periodStart DESC)`, `(tenantId, canonicalKey, periodEnd DESC)`, `(tenantId, periodStart, periodEnd)`, `(assuranceSnapshotId)`, `(sourceExtractionId)`, `(sourceCalcRunId)` |
| 12 | `CalcRun` | added `(tenantId, computedAt DESC)`, `(formulaVersionId)` |
| 13 | `WorkflowInstance` | `workflow` `onDelete: Restrict`; added `(tenantId, status, slaDeadline)`, `(workflowId)` |
| 14 | `ApprovalAction` | added `(workflowInstanceId, step)`, `(performedBy, performedAt DESC)` |
| 15 | `AssuranceSnapshot` | added `@@unique([tenantId, fy, framework, snapshotAt])`, `(tenantId, status, snapshotAt DESC)`, `(parentSnapshotId)` |
| 16 | `AuditException` | added `(snapshotId, status)`, `(snapshotId, severity)`, `(metricEventId)` |
| 17 | `Report` | added `@@unique([tenantId, fy, framework, version])`, `(tenantId, status, generatedAt DESC)`, `(parentReportId)` |
| 18 | `Supplier` | added `@@unique([tenantId, primaryContactEmail])`, `(tenantId, country)`, `(tenantId, sector)` |
| 19 | `SupplierInvite` | `questionnaire` `onDelete: Restrict`; added `(supplierId, expiresAt)`, `(questionnaireId)`, `(expiresAt)` |
| 20 | `SupplierResponse` | `questionnaire` `onDelete: Restrict`; added `(supplierId, submittedAt DESC)`, `(questionnaireId)`, `(status)` |
| 21 | `EmissionFactor` | added `(source, activityType, region, gas, validFrom DESC)`, `(validFrom, validTo)` |
| 22 | `SbtiTarget` | added `(tenantId, status)`, `(tenantId, scope, targetYear)` |
| 23 | `AbatementProject` | added `(tenantId, status)`, `(tenantId, startDate, endDate)` |
| 24 | `CarbonCredit` | added `(tenantId, vintage DESC)`, `(tenantId, retiredOn)` |
| 25 | `CopilotConversation` | added `(tenantId, lastMessageAt DESC)` |
| 26 | `CopilotMessage` | added `(conversationId, role, createdAt)` |
| 27 | `DocStatus` enum | added `UPLOADED`, `EXTRACTION_FAILED`, `PARTIAL`, `NEEDS_REVIEW` |
| 28 | `MetricStatus` enum | added `REJECTED` |
| 29 | `ExtractionStatus` enum | added `AUTO_ACCEPTED` |
| 30 | `AuditExceptionStatus` enum | added `IN_REVIEW` |
| 31 | `ReportStatus` enum | added `GENERATING`, `GENERATED` |
| 32 | `SupplierStatus` enum | added `ACTIVE` |

Additionally:
- `services/api/prisma/SCHEMA_DRIFT.md` — created, documenting (A) indexes/FKs/enums added in this audit that need a fresh migration, (B) the wide code↔schema rename drift, and (C) the missing `02_partitions` migration.

---

## 3. Gaps NOT Fixed

### G-01 — Code↔schema rename drift in section B of SCHEMA_DRIFT.md is **not** patched here
The right resolution is a refactor (either rename models in schema or refactor services) that affects ~20 files and requires product decisions on:
- whether the canonical entity-tree model is `entity_node` or `hierarchy_node`;
- whether `canonical_metric` is renamed to `metric_registry`;
- whether assurance items get their own snapshot-item table or stay inline JSON;
- whether materiality gets a richer model with separate `survey`, `surveyInvitation`, `surveyScore`, `assessmentRun` tables instead of the consolidated `materiality_survey` + `materiality_assessment_run` it has now.

Each of those is a sprint, not a schema patch. Filed for engineering.

### G-02 — Partitioning of `metric_event` and `audit_log` (F-03)
A real `02_partitions/migration.sql` requires `pg_partman` policies, a downtime window or `pg_repack` strategy for live promotion of an existing heap to a partitioned parent, and a cron for monthly child-partition creation. Out of scope for a schema-only audit. **Required before next major release.**

### G-03 — User FK on actor/uploader/submitter columns
`AuditLog.actorUserId`, `Document.uploadedBy`, `MetricEvent.submittedBy`/`approvedBy`, `MaterialitySurvey.createdBy`, etc. are declared as `String` with no FK to `User`. This is intentional for audit immutability (a User row deletion shouldn't cascade-rewrite audit trail). Leaving as-is, but the lack of FK is a deliberate design choice that should be **documented in code-review checklists**.

### G-04 — `Document` has no `deletedAt`
A code comment in `files/files.service.ts:261` notes "Document model has no `deletedAt` — just flip status." This is intentional but inconsistent with `Supplier`/`DataSource`/`EntityNode`/`MetricEvent` which all use `deletedAt`. Either every model should soft-delete the same way or the inconsistency should be explicitly justified in `ARCHITECTURE.md`. Not patched.

### G-05 — `MaterialTopic.tenant` is `Cascade` on a nullable FK
When `tenantId` is NULL the row is part of the system catalog. Cascade on nullable behaves correctly (no parent → no cascade) but the intent would read better as `Restrict`. Tradeoff is small; left as-is to avoid behaviour change.

### G-06 — Partial / expression indexes for `metric_event` dimensions JSON
The business-level dedup key includes the JSON `dimensions` column. Prisma cannot express expression indexes; this needs a raw `CREATE UNIQUE INDEX ... ((dimensions::text))` in a future migration. Noted as a comment inline in the schema.

### G-07 — `audit_log` retention archive table
`01_init/migration.sql` line 519 mentions an `archive_audit_log` cold table for partitions older than 24 months. Neither schema nor migration defines it. Will land with the partitioning migration.
