-- =========================================================
-- BRSR Platform v2 — initial schema
-- This migration assumes Prisma's generated CREATE TABLE
-- statements run BEFORE this file (in practice Prisma's
-- `migrate dev` will generate that boilerplate above; this
-- file represents the post-table customizations: extensions,
-- ltree, RLS, partitioning, hash-chain triggers).
--
-- Sections:
--   1) Extensions
--   2) ltree column conversion + GiST indexes (entity_node)
--   3) pg_trgm fuzzy indexes
--   4) Row-Level Security helpers + per-table policies
--   5) audit_log hash chain trigger + append-only enforcement
--   6) Partitioning notes (deferred to 02_partitions)
--   7) Composite/partial indexes Prisma can't express well
-- =========================================================


-- =========================================================
-- 1) EXTENSIONS
-- =========================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gin";


-- =========================================================
-- 2) LTREE COLUMN CONVERSION (entity_node.ltree_path)
-- Prisma declares ltree_path as TEXT for compatibility.
-- We promote it to a real ltree column and add a GiST index
-- for fast ancestor / descendant queries.
-- =========================================================
ALTER TABLE "entity_node"
  ALTER COLUMN "ltree_path" TYPE ltree
  USING (CASE WHEN "ltree_path" IS NULL THEN NULL ELSE "ltree_path"::ltree END);

CREATE INDEX IF NOT EXISTS "entity_node_ltree_path_gist_idx"
  ON "entity_node" USING GIST ("ltree_path");

-- Composite GiST: (tenant_id, ltree_path) — accelerates tenant-scoped
-- subtree queries (e.g. `WHERE tenant_id = $1 AND ltree_path <@ 'grp.ipil'`).
CREATE INDEX IF NOT EXISTS "entity_node_tenant_ltree_idx"
  ON "entity_node" USING GIST ("tenant_id", "ltree_path");


-- =========================================================
-- 3) pg_trgm FUZZY INDEXES
-- Power "did you mean X" suggestions for suppliers, docs,
-- and entity nodes from the global search bar.
-- =========================================================
CREATE INDEX IF NOT EXISTS "supplier_name_trgm_idx"
  ON "supplier" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "document_original_name_trgm_idx"
  ON "document" USING GIN ("original_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "entity_node_name_trgm_idx"
  ON "entity_node" USING GIN ("name" gin_trgm_ops);


-- =========================================================
-- 4) ROW-LEVEL SECURITY
--
-- Session GUCs:
--   app.current_tenant_id  — set per-request by API gateway after JWT verify
--   app.bypass_rls         — set to 'true' only by migration/admin tooling
--
-- Every tenant-scoped table has both ENABLE + FORCE RLS, so even
-- the table owner role is bound by policies unless rls_bypass() returns true.
-- =========================================================

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text AS $$
  SELECT current_setting('app.current_tenant_id', true);
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION rls_bypass() RETURNS boolean AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true)::boolean, false);
$$ LANGUAGE SQL STABLE;

-- ---------- tenant ----------
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_self_isolation" ON "tenant"
  USING (rls_bypass() OR id = current_tenant_id())
  WITH CHECK (rls_bypass() OR id = current_tenant_id());

-- ---------- tenant_setting ----------
ALTER TABLE "tenant_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_setting_tenant_isolation" ON "tenant_setting"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- identity_provider ----------
ALTER TABLE "identity_provider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_provider" FORCE ROW LEVEL SECURITY;
CREATE POLICY "identity_provider_tenant_isolation" ON "identity_provider"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- user ----------
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_tenant_isolation" ON "user"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- role ----------
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role" FORCE ROW LEVEL SECURITY;
CREATE POLICY "role_tenant_isolation" ON "role"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- role_assignment (joins to user for tenant_id) ----------
ALTER TABLE "role_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "role_assignment_tenant_isolation" ON "role_assignment"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.id = "role_assignment".user_id
        AND u.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.id = "role_assignment".user_id
        AND u.tenant_id = current_tenant_id()
    )
  );

-- ---------- api_key ----------
ALTER TABLE "api_key" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_key" FORCE ROW LEVEL SECURITY;
CREATE POLICY "api_key_tenant_isolation" ON "api_key"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- audit_log ----------
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- entity_node ----------
ALTER TABLE "entity_node" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entity_node" FORCE ROW LEVEL SECURITY;
CREATE POLICY "entity_node_tenant_isolation" ON "entity_node"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- material_topic (tenant_id may be NULL for system catalog) ----------
ALTER TABLE "material_topic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_topic" FORCE ROW LEVEL SECURITY;
CREATE POLICY "material_topic_tenant_isolation" ON "material_topic"
  USING (rls_bypass() OR tenant_id IS NULL OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- stakeholder_group ----------
ALTER TABLE "stakeholder_group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stakeholder_group" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stakeholder_group_tenant_isolation" ON "stakeholder_group"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- materiality_survey ----------
ALTER TABLE "materiality_survey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materiality_survey" FORCE ROW LEVEL SECURITY;
CREATE POLICY "materiality_survey_tenant_isolation" ON "materiality_survey"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- survey_response (joins to materiality_survey) ----------
ALTER TABLE "survey_response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_response" FORCE ROW LEVEL SECURITY;
CREATE POLICY "survey_response_tenant_isolation" ON "survey_response"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "materiality_survey" s
      WHERE s.id = "survey_response".survey_id
        AND s.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "materiality_survey" s
      WHERE s.id = "survey_response".survey_id
        AND s.tenant_id = current_tenant_id()
    )
  );

-- ---------- materiality_assessment_run ----------
ALTER TABLE "materiality_assessment_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materiality_assessment_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "materiality_assessment_run_tenant_isolation" ON "materiality_assessment_run"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- data_source ----------
ALTER TABLE "data_source" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_source" FORCE ROW LEVEL SECURITY;
CREATE POLICY "data_source_tenant_isolation" ON "data_source"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- ingest_event ----------
ALTER TABLE "ingest_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingest_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ingest_event_tenant_isolation" ON "ingest_event"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- document ----------
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "document_tenant_isolation" ON "document"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- extraction_field ----------
ALTER TABLE "extraction_field" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "extraction_field" FORCE ROW LEVEL SECURITY;
CREATE POLICY "extraction_field_tenant_isolation" ON "extraction_field"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- metric_event ----------
ALTER TABLE "metric_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metric_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "metric_event_tenant_isolation" ON "metric_event"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- calc_run ----------
ALTER TABLE "calc_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calc_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calc_run_tenant_isolation" ON "calc_run"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- approval_workflow ----------
ALTER TABLE "approval_workflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_workflow" FORCE ROW LEVEL SECURITY;
CREATE POLICY "approval_workflow_tenant_isolation" ON "approval_workflow"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- workflow_instance ----------
ALTER TABLE "workflow_instance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_instance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workflow_instance_tenant_isolation" ON "workflow_instance"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- approval_action (joins to workflow_instance) ----------
ALTER TABLE "approval_action" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_action" FORCE ROW LEVEL SECURITY;
CREATE POLICY "approval_action_tenant_isolation" ON "approval_action"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "workflow_instance" wi
      WHERE wi.id = "approval_action".workflow_instance_id
        AND wi.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "workflow_instance" wi
      WHERE wi.id = "approval_action".workflow_instance_id
        AND wi.tenant_id = current_tenant_id()
    )
  );

-- ---------- assurance_snapshot ----------
ALTER TABLE "assurance_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assurance_snapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "assurance_snapshot_tenant_isolation" ON "assurance_snapshot"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- audit_exception (joins to assurance_snapshot) ----------
ALTER TABLE "audit_exception" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_exception" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_exception_tenant_isolation" ON "audit_exception"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "assurance_snapshot" s
      WHERE s.id = "audit_exception".snapshot_id
        AND s.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "assurance_snapshot" s
      WHERE s.id = "audit_exception".snapshot_id
        AND s.tenant_id = current_tenant_id()
    )
  );

-- ---------- report ----------
ALTER TABLE "report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_tenant_isolation" ON "report"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- supplier ----------
ALTER TABLE "supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_tenant_isolation" ON "supplier"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- supplier_questionnaire ----------
ALTER TABLE "supplier_questionnaire" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_questionnaire" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_questionnaire_tenant_isolation" ON "supplier_questionnaire"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- supplier_invite (joins to supplier) ----------
ALTER TABLE "supplier_invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_invite" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_invite_tenant_isolation" ON "supplier_invite"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "supplier" s
      WHERE s.id = "supplier_invite".supplier_id
        AND s.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "supplier" s
      WHERE s.id = "supplier_invite".supplier_id
        AND s.tenant_id = current_tenant_id()
    )
  );

-- ---------- supplier_response (joins to supplier) ----------
ALTER TABLE "supplier_response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_response" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_response_tenant_isolation" ON "supplier_response"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "supplier" s
      WHERE s.id = "supplier_response".supplier_id
        AND s.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "supplier" s
      WHERE s.id = "supplier_response".supplier_id
        AND s.tenant_id = current_tenant_id()
    )
  );

-- ---------- supplier_score (joins to supplier) ----------
ALTER TABLE "supplier_score" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_score" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_score_tenant_isolation" ON "supplier_score"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "supplier" s
      WHERE s.id = "supplier_score".supplier_id
        AND s.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "supplier" s
      WHERE s.id = "supplier_score".supplier_id
        AND s.tenant_id = current_tenant_id()
    )
  );

-- ---------- sbti_target ----------
ALTER TABLE "sbti_target" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sbti_target" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sbti_target_tenant_isolation" ON "sbti_target"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- abatement_project ----------
ALTER TABLE "abatement_project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "abatement_project" FORCE ROW LEVEL SECURITY;
CREATE POLICY "abatement_project_tenant_isolation" ON "abatement_project"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- carbon_credit ----------
ALTER TABLE "carbon_credit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carbon_credit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "carbon_credit_tenant_isolation" ON "carbon_credit"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- copilot_conversation ----------
ALTER TABLE "copilot_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_conversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "copilot_conversation_tenant_isolation" ON "copilot_conversation"
  USING (rls_bypass() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());

-- ---------- copilot_message (joins to copilot_conversation) ----------
ALTER TABLE "copilot_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "copilot_message_tenant_isolation" ON "copilot_message"
  USING (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "copilot_conversation" c
      WHERE c.id = "copilot_message".conversation_id
        AND c.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    rls_bypass() OR EXISTS (
      SELECT 1 FROM "copilot_conversation" c
      WHERE c.id = "copilot_message".conversation_id
        AND c.tenant_id = current_tenant_id()
    )
  );


-- =========================================================
-- 5) AUDIT LOG HASH CHAIN + APPEND-ONLY
--
-- Each row gets prev_hash + row_hash so the audit log forms a
-- tamper-evident chain per-tenant. Auditors can replay the chain
-- offline to detect modifications. UPDATE/DELETE are blocked so
-- the chain can never be silently rewritten.
-- =========================================================

ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "prev_hash" bytea;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "row_hash" bytea;

CREATE INDEX IF NOT EXISTS "audit_log_tenant_created_idx"
  ON "audit_log" ("tenant_id", "created_at" DESC);

CREATE OR REPLACE FUNCTION audit_log_hash_chain() RETURNS trigger AS $$
DECLARE
  prev    bytea;
  payload text;
BEGIN
  SELECT row_hash INTO prev
    FROM audit_log
   WHERE tenant_id = NEW.tenant_id
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  IF prev IS NULL THEN
    -- Genesis hash for a tenant's chain.
    prev := decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  END IF;

  payload := concat_ws(
    '|',
    NEW.id,
    NEW.tenant_id,
    coalesce(NEW.actor_user_id, ''),
    NEW.entity_type,
    NEW.entity_id,
    NEW.action::text,
    NEW.diff::text,
    coalesce(NEW.ip_address, ''),
    coalesce(NEW.user_agent, ''),
    coalesce(NEW.request_id, ''),
    NEW.created_at::text
  );

  NEW.prev_hash := prev;
  NEW.row_hash  := digest(prev || payload::bytea, 'sha256');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_hash_chain_trg
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_hash_chain();

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();


-- =========================================================
-- 6) PARTITIONING (deferred to 02_partitions)
--
-- Prisma's `migrate diff` does not understand declarative
-- partitioning, so we apply it in a follow-up migration that
-- runs AFTER Prisma has created the unpartitioned table — by
-- detaching the table, recreating it as PARTITION BY, and
-- attaching child partitions.
--
--   metric_event:
--     PARTITION BY HASH (tenant_id)        — 32 partitions
--     sub-PARTITION BY RANGE (period_start) — yearly back to 2018
--
--   audit_log:
--     PARTITION BY RANGE (created_at)      — monthly, 24-month rolling
--     `archive_audit_log` table for partitions older than 24 months
-- =========================================================


-- =========================================================
-- 7) COMPOSITE / PARTIAL INDEXES PRISMA CAN'T EXPRESS WELL
-- =========================================================

CREATE INDEX IF NOT EXISTS "metric_event_tenant_canonical_period_status_idx"
  ON "metric_event" ("tenant_id", "canonical_key", "period_start" DESC, "status");

CREATE INDEX IF NOT EXISTS "extraction_field_low_confidence_idx"
  ON "extraction_field" ("tenant_id", "confidence_composite")
  WHERE "status" IN ('DRAFT', 'NEEDS_REVIEW');

CREATE INDEX IF NOT EXISTS "supplier_active_idx"
  ON "supplier" ("tenant_id", "status")
  WHERE "status" != 'ARCHIVED';
