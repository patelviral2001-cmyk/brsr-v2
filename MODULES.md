# BRSR AI Platform — Modules

Twelve modules, one product. Each module is a NestJS module in `apps/api/src/modules/<name>`, a folder of React routes in `apps/web/app/(tenant)/<name>`, and (where applicable) a LangGraph subgraph in `apps/ai-engine/agents/`. Modules expose REST and emit/consume Kafka events; cross-module access goes through service interfaces, never direct DB joins across module boundaries.

Reading order: Org Setup → Materiality → Data Collection → AI Extraction → Metric Registry → Calculation Engine → Supplier Portal → Audit and Assurance → BRSR Report Builder → Dashboards → Carbon Accounting → AI Copilot.

---

## 1. Org Setup

**Purpose.** Models the customer organisation — legal entities, lines of business, facilities, business units, and reporting hierarchies. This is the "left edge" of the schema: every metric, evidence file, supplier and report ultimately attaches to a node in this tree. Without Org Setup, nothing else works.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `tenant` | Top-level customer | id, name, isolation_mode, kms_key_arn, region |
| `legal_entity` | Registered company / LLP / branch | id, tenant_id, cin, gstin, jurisdiction |
| `line_of_business` | Reporting sector (BRSR sectoral) | id, nic_code, parent_id |
| `facility` | Plant, office, warehouse | id, kind, address, lat, lon, area_sqm |
| `org_node` | Generic hierarchy node (ltree) | id, path (ltree), name, kind |
| `reporting_unit` | Used in consolidation | id, scope (subsidiary / JV / associate), consolidation_method |

**Workflows.**

1. Tenant admin imports legal entities (CSV) or syncs from MCA.
2. Map each legal entity to one or more facilities (georeferenced).
3. Define reporting hierarchy using ltree (`group.power.tn_solar`).
4. Assign owners and approvers per node.
5. Lock the structure for the FY; subsequent changes generate a change-of-scope event flagged for assurance.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /tenants | Provision new tenant (admin only) |
| GET | /legal-entities | List legal entities |
| POST | /legal-entities | Create |
| POST | /legal-entities/import | CSV / MCA sync |
| GET | /facilities | List with filter by entity / LoB |
| POST | /facilities | Create |
| GET | /org/tree | Full ltree as nested JSON |
| POST | /org/lock | Lock structure for FY |

**UI surfaces.**

- Org Tree view (drag-and-drop with ltree path edit)
- Legal Entity registry table
- Facility map (Mapbox, lat/lon visualisation)
- Hierarchy lock confirmation modal

**Dependencies.** None inbound. Outbound: all other modules read from this.

**KPIs / success metrics.**

- Time to first BRSR-ready hierarchy < 30 minutes.
- 100% facilities geocoded.
- 0 unmapped legal entities at FY lock.

---

## 2. Materiality

**Purpose.** Runs the double-materiality assessment that grounds every BRSR / GRI / IFRS disclosure. Stakeholder surveys feed an impact-likelihood matrix; the board signs off on what is and is not material. Down-stream modules use materiality scores to prioritise data collection and to determine which metrics appear in which report.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `materiality_assessment` | Per-FY assessment | id, tenant_id, fy, status, matrix_hash |
| `materiality_topic` | ESG topic (e.g. water stress) | id, code, name, framework_refs[] |
| `materiality_survey` | Distributable survey | id, assessment_id, audience_kind, sent_at |
| `materiality_response` | Stakeholder response | id, survey_id, respondent_id, scores JSONB |
| `materiality_signoff` | Board signoff | id, assessment_id, signed_by, ed25519_sig |

**Workflows.**

1. Sustainability Manager selects topics from the GRI 2025 / SASB topic library (~120 topics, pre-seeded).
2. Launches surveys to four audiences: employees, suppliers, customers, investors. Each gets a token magic link.
3. Responses stream in over a typical 2-week window; real-time matrix updates.
4. Manager weights responses (employees 0.25 / suppliers 0.20 / customers 0.30 / investors 0.25).
5. Manager produces a draft matrix and a written rationale (Narrative agent assists).
6. Board signs off via DocuSign; signed matrix hash anchors the FY.
7. Material topics drive Metric Registry's "required for this FY" flag.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /materiality/assessments | Start new FY assessment |
| POST | /materiality/topics:bulk-import | Import from GRI library |
| POST | /materiality/surveys | Distribute survey |
| GET | /materiality/responses?surveyId= | List responses |
| PATCH | /materiality/responses/:id | Submit (token-auth, public) |
| GET | /materiality/matrix?assessmentId= | Current matrix |
| POST | /materiality/lock | Lock + request signoff |
| POST | /materiality/signoffs | Record board signoff |

**UI surfaces.**

- Topic selector grid (with framework filter)
- Survey builder (multi-audience)
- Live materiality matrix (D3 scatter with quadrant zones)
- Stakeholder responses heatmap
- Board signoff workspace (Docusign embed)

**Dependencies.** Inbound from Org Setup. Outbound to Metric Registry, BRSR Report Builder, Dashboards.

**KPIs.**

- Survey response rate > 35%.
- Assessment cycle < 5 weeks (industry norm: 14).
- 100% material topics map to at least one BRSR / GRI metric.

---

## 3. Data Collection

**Purpose.** Captures evidence (PDFs, images, CSVs, ERP exports, manual entries) for every required metric across every facility across every period. This is the highest-volume module by row count and the principal source of audit-trail data.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `data_request` | A planned collection task | id, metric_id, facility_id, period, due_at, assignee_id |
| `data_submission` | A user response to a request | id, request_id, kind (file / value / api), value_numeric, value_unit |
| `evidence_file` | Object reference | id, s3_key, sha256, mime, page_count, retain_until |
| `import_run` | Batch import (CSV / SAP) | id, source_kind, row_count, errors_count |

**Workflows.**

1. Manager bulk-creates data requests from a template (e.g. monthly electricity for all 14 facilities x 12 months).
2. Plant managers receive email + in-app reminder.
3. They upload evidence (PDF, JPEG of meter, CSV) or enter a value directly.
4. File hits S3 via presigned URL; SHA-256 + virus scan run synchronously.
5. `EvidenceUploaded` event triggers AI Extraction (Module 4).
6. Once extracted/approved, the submission is marked complete and the dashboard's "x% ready" gauge ticks.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /data-requests | Bulk-create |
| GET | /data-requests?status=open | List open |
| POST | /files/presign | Get presigned PUT URL |
| POST | /files/complete | Notify upload done |
| GET | /files/:id | Metadata |
| GET | /files/:id/download | Signed GET URL |
| POST | /imports/erp | Trigger ERP delta sync |
| GET | /imports/:id | Status |

**UI surfaces.**

- Data Collection Plan grid (request matrix view)
- Drag-and-drop evidence vault
- ERP connector setup (SAP, Oracle Fusion, Tally)
- Plant manager mobile capture (Capacitor app: scan + auto-OCR)

**Dependencies.** Inbound from Org Setup, Materiality (drives required metrics), Metric Registry. Outbound to AI Extraction, Audit.

**KPIs.**

- Average evidence upload time per facility < 3 minutes.
- < 5% requests overdue at FY close.
- 100% submissions with attached evidence (not bare numbers).

---

## 4. AI Extraction

**Purpose.** Turns unstructured evidence into typed, cited metric observations. The five-state LangGraph extraction agent reads each uploaded document, identifies metric-bearing regions, extracts values with bounding-box citations, runs a self-critique, scores confidence, and routes to either autocommit or HITL.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `extraction_run` | One agent invocation | id, file_id, agent_version, status, latency_ms, cost_usd |
| `extraction_field` | One extracted value | id, run_id, metric_code, value_numeric, value_unit, bbox JSONB, confidence_components JSONB |
| `hitl_task` | A queued review | id, field_id, assignee_id, due_at, decision |
| `prompt_version` | Versioned prompts | id, agent_name, sha, body |

**Workflows.**

1. EvidenceUploaded triggers an ai-engine job.
2. Document parsed → pages classified → RAG lookup for similar prior extractions in same tenant.
3. Opus 4.7 extracts with structured-output schema; judge pass scores it.
4. ExtractionRun + N ExtractionField rows persisted.
5. Confidence > 0.95 → autocommit to Metric Registry; otherwise → HITL.
6. Reviewer approves / edits / rejects; approved fields become metric_observations.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /extraction/runs | Trigger manual re-run |
| GET | /extraction/runs/:id | Run details + fields |
| GET | /hitl/tasks?status=pending | Reviewer queue |
| PATCH | /hitl/tasks/:id | Approve / edit / reject |
| GET | /extraction/runs/:id/trace | Langfuse trace |

**UI surfaces.**

- HITL queue (sorted by confidence ascending)
- Side-by-side PDF + extracted JSON view
- Bounding-box highlight overlay
- Edit-and-resubmit form
- Re-run with newer prompt button

**Dependencies.** Inbound from Data Collection. Outbound to Metric Registry, Audit, Copilot.

**KPIs.**

- Autocommit rate > 70% (target Q4: 85%).
- HITL median time-to-decision < 2 minutes.
- Hallucination rate (caught at judge or HITL) < 0.5%.
- Cost per extraction < INR 18.

---

## 5. Metric Registry

**Purpose.** The canonical, versioned, framework-agnostic dictionary of every metric the platform understands. A `Metric` defines the question; a `MetricObservation` is an answer for a given facility + period. Framework mappings (BRSR, GRI, TCFD, IFRS, CDP) read from this registry — so a single approved observation can simultaneously satisfy 4 to 6 framework requirements.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `metric` | Canonical definition | id, code, name, kind (intensity / absolute / boolean / narrative), unit, periodicity, hierarchy_level |
| `metric_version` | Versioned definition | id, metric_id, sha, definition, change_note, valid_from |
| `metric_mapping` | Maps to framework field | id, metric_id, framework, field_path, transform |
| `metric_observation` | Approved value | id, metric_id, facility_id, period, value_numeric, value_unit, evidence_id |
| `metric_alias` | Synonyms for search | id, metric_id, alias, locale |

**Workflows.**

1. On platform install, the BRSR Core + Comprehensive + GRI 2025 + TCFD + IFRS S1/S2 registries are seeded (~1,200 metrics).
2. Tenant can add custom metrics (e.g. for industry-specific KPIs).
3. Each metric has versioned definitions; version bumps require migration of dependent calculations.
4. Observations attach to a `metric_version_id` so historical reports remain reproducible.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| GET | /metrics | Search / filter |
| POST | /metrics | Create custom |
| GET | /metrics/:code/versions | Version history |
| POST | /metrics/:code/mappings | Add framework mapping |
| POST | /metric-observations | Insert (used by HITL approval) |
| GET | /metric-observations?facility=&period= | Query |
| POST | /metric-observations/:id/restate | Re-statement (creates revision) |

**UI surfaces.**

- Metric catalog browser (faceted by framework)
- Metric definition page (formula, citations, history)
- Restatement workspace (with explanation field)

**Dependencies.** Inbound from Materiality (drives required set), AI Extraction (populates observations), Calculation Engine (reads). Outbound to BRSR Report Builder, Dashboards, Copilot.

**KPIs.**

- 100% BRSR Core metrics covered at platform install.
- < 24 h to add a new custom metric and surface it in UI.
- Re-statement audit trail accessible in < 5 clicks.

---

## 6. Calculation Engine

**Purpose.** Executes the directed acyclic graph of dependent metrics. A "Scope 2 location-based" calculation, for example, depends on electricity-consumption observations across 47 facilities multiplied by grid emission factors with regional weights. The engine builds a DAG, evaluates CEL formulas, caches intermediates, and records full lineage so the assurance team can replay the math.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `formula` | Versioned CEL expression | id, metric_id, version, expression, inputs JSONB |
| `calculation_run` | One execution | id, formula_id, scope (period, entities), status, output_value |
| `calculation_lineage` | DAG node | id, run_id, depth, formula_id, inputs JSONB, input_hash, output |
| `emission_factor` | Lookup table | id, source (IPCC, India MoEFCC, DEFRA), region, year, value |

**Workflows.**

1. Manager triggers a calculation (e.g. Scope 2 location-based for FY 2026).
2. Engine resolves formula DAG via topological sort.
3. For each leaf, fetch the latest approved observation respecting `as_of`.
4. CEL evaluates each node; unit conversions via `packages/utils/units.ts`.
5. Lineage rows written per node.
6. Output stored on the parent metric_observation row with `source_kind = 'calculated'`.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /calculations/runs | Trigger |
| GET | /calculations/runs/:id | Status + result |
| GET | /calculations/runs/:id/lineage | Full DAG (JSON) |
| GET | /formulas?metric= | List formulas |
| POST | /formulas | Create custom |

**UI surfaces.**

- DAG visualiser (React Flow)
- Per-node drill-in showing inputs, formula, output
- "Why did this number change?" diff between two runs

**Dependencies.** Inbound from Metric Registry (observations), AI Extraction (approval triggers re-calc). Outbound to BRSR Report Builder, Carbon, Dashboards.

**KPIs.**

- Average DAG of 50 nodes evaluates in < 4 s.
- Re-calculation triggers within 30 s of upstream observation change.
- 100% lineage rows persisted (no silent dependencies).

---

## 7. Supplier Portal

**Purpose.** Onboards Tier-1 and Tier-2 suppliers to submit Scope 3 emissions data, EcoVadis-style ESG questionnaires, and invoice-level activity data. Built as a separate Next.js app (`apps/supplier-portal`) with magic-link auth so suppliers do not need full platform accounts.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `supplier` | Customer's supplier record | id, tenant_id, name, gstin, country, tier (1/2/3) |
| `supplier_invitation` | Magic-link token | id, supplier_id, token_hash, expires_at, used_at |
| `supplier_submission` | A round of submission | id, supplier_id, period, status |
| `supplier_questionnaire` | Tailored question set | id, name, schema JSONB |
| `supplier_response` | A questionnaire answer | id, submission_id, question_code, value JSONB |

**Workflows.**

1. Sustainability manager creates a supplier directory (CSV upload or onboard one-by-one).
2. Picks a questionnaire template and a reporting period; sends invitations.
3. Supplier clicks magic link, lands in supplier portal, sees a friendly checklist.
4. Uploads invoices and activity data; the same AI extraction agent fills in fields.
5. Submits. Manager reviews and approves; data flows into the customer's Scope 3 accounting.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /suppliers | Create |
| POST | /suppliers/:id/invite | Send magic link |
| GET | /suppliers/:id/submissions | List |
| GET | /supplier-portal/me | (supplier token auth) self |
| PATCH | /supplier-portal/submissions/:id | Save draft |
| POST | /supplier-portal/submissions/:id/submit | Lock |

**UI surfaces.**

- Supplier directory
- Supplier scorecard (response rate, completeness, data quality)
- Public supplier-portal landing (whitelabel branding)
- Supplier survey progress tracker
- AI-assisted invoice parsing in supplier-portal

**Dependencies.** Inbound from Org Setup, Metric Registry (questionnaire schema). Outbound to AI Extraction, Carbon Accounting.

**KPIs.**

- Supplier response rate per cycle > 60%.
- Mean time from invitation to first submission < 10 days.
- 80% Scope 3 spend covered by direct supplier data within 12 months.

---

## 8. Audit and Assurance

**Purpose.** Provides Big-4 and assurance partners a workspace to inspect, sample, and sign off BRSR disclosures. Snapshot mechanism freezes the entire metric + lineage + evidence corpus at a point in time, hash-anchored, with read-only auditor access scoped to that snapshot.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `assurance_snapshot` | Point-in-time freeze | id, fy, root_hash, prev_snapshot_id, locked_at |
| `assurance_finding` | Auditor finding | id, snapshot_id, kind (observation / qualification / disclaimer), severity, body |
| `assurance_signoff` | Final signature | id, snapshot_id, partner_id, ed25519_sig, signed_at |
| `audit_event` | Append-only log (per module) | (see Architecture) |

**Workflows.**

1. Manager locks FY → creates a snapshot tar.gz + Merkle root.
2. Auditor receives a scoped SAML role + S3 read-only role.
3. Auditor browses an assurance workspace UI mirroring the snapshot.
4. Auditor selects samples (the system suggests stratified samples by facility, metric and confidence).
5. Auditor records findings; if severity = qualification, dashboards reflect "qualified" status.
6. Partner signs the snapshot with Ed25519; signature posted to public bulletin.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /assurance/snapshots | Lock + export |
| GET | /assurance/snapshots/:id | Metadata |
| POST | /assurance/findings | Record |
| POST | /assurance/signoffs | Sign |
| GET | /audit/events?subjectId= | Per-subject audit trail |

**UI surfaces.**

- Snapshot inspector (table of metrics with sample status)
- Finding editor
- Hash-chain visualiser
- Partner signoff modal (HSM-backed)

**Dependencies.** Inbound from all data modules. Outbound to BRSR Report Builder (assured vs unassured badge).

**KPIs.**

- Snapshot creation < 90 s.
- Auditor time to find any metric's source < 30 s.
- 100% snapshots cryptographically verifiable post-hoc.

---

## 9. BRSR Report Builder

**Purpose.** Composes the final SEBI-filable BRSR PDF + iXBRL package. Sections 1-9 of BRSR Core and the 15 principles of BRSR Comprehensive are rendered from MDX templates with data references resolved at render time. Outputs are deterministic given the same snapshot; the renderer is invoked from the reports-service with headless Chromium.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `report` | A drafted report | id, kind (BRSR_CORE / BRSR_COMP / GRI / TCFD), fy, snapshot_id, status |
| `report_section` | Section state | id, report_id, code, status (auto / draft / final), body MDX |
| `report_artifact` | Generated PDF / XBRL | id, report_id, format, s3_key, sha256, signed_by |
| `report_template` | Versioned template | id, kind, version, mdx, schema_refs |

**Workflows.**

1. Manager creates a new report (BRSR Core FY 2025-26).
2. Engine validates all required metrics exist and have approved observations.
3. Auto-fill from registry; manager edits narrative sections.
4. Generate → reports-service renders MDX → React SSR → Chromium PDF + iXBRL.
5. Manager sends to Board for digital signature (DocuSign embed).
6. Once signed, report is archived to S3 WORM and lodged with SEBI.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /reports | Create draft |
| PATCH | /reports/:id/sections/:code | Update section |
| POST | /reports/:id/generate | Generate PDF + XBRL |
| GET | /reports/:id/artifacts | List artifacts |
| POST | /reports/:id/lodge | File with SEBI (API integration) |

**UI surfaces.**

- Report builder split-pane (template + live preview)
- Section status tracker
- Auto-fill vs override indicator
- SEBI lodging workspace

**Dependencies.** Inbound from Metric Registry, Calculation Engine, Materiality, Assurance. Outbound to Dashboards.

**KPIs.**

- Time from data freeze to lodged BRSR < 5 business days.
- 0 reporting framework field errors at lodging.
- 100% reports reproducible from snapshot hash.

---

## 10. Dashboards

**Purpose.** Executive-grade dashboards. Includes ESG performance overview, BRSR readiness gauge, peer-percentile cards, carbon trajectory vs target, materiality matrix, and an explorer for ad-hoc queries.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `dashboard` | Saved dashboard | id, name, owner_id, layout JSONB |
| `dashboard_widget` | Widget config | id, dashboard_id, kind, query JSONB |
| `kpi_target` | Target line | id, metric_id, fy, value, kind (absolute / intensity) |
| `benchmark_snapshot` | Peer reference data | id, sector_nic, metric_id, p25, p50, p75, p90 |

**Workflows.**

1. Curated default dashboards seeded per tenant (Exec, Sustainability, Operations).
2. Users compose custom dashboards from a widget library.
3. Widgets pull from ClickHouse for OLAP; from Postgres for real-time tiles.
4. Variance alerts (e.g. Scope 1 up > 10% vs PY) trigger from Anomaly agent.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| GET | /dashboards | List |
| POST | /dashboards | Create |
| GET | /widgets/:id/data | Materialised data |
| GET | /benchmarks?metric=&sector= | Peer percentiles |
| POST | /kpi-targets | Set target |

**UI surfaces.**

- Dashboard grid (React Grid Layout)
- Widget gallery
- Drill-through to underlying metric observations
- Export as PDF / PowerPoint

**Dependencies.** Inbound from Metric Registry, Calculation Engine, Carbon. Outbound to Copilot.

**KPIs.**

- Dashboard load p95 < 1.5 s on a 50-widget board.
- 80% of users compose a custom dashboard within first 30 days.
- 100% drill-through ends at a citable observation.

---

## 11. Carbon Accounting

**Purpose.** GHG Protocol-compliant Scope 1 / 2 / 3 accounting with both location-based and market-based Scope 2, and category 1-15 Scope 3 with PCAF-aligned financed-emissions support. The carbon engine wraps the Calculation Engine with carbon-specific conveniences: emission-factor library, GWP versioning (AR5/AR6), and target-tracking against SBTi pathways.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `emission_factor_set` | Versioned EF library | id, source, year, region |
| `emission_factor` | Single factor | id, set_id, activity_code, value, unit, gwp_set (AR5/AR6) |
| `carbon_inventory` | A computed inventory | id, scope, fy, total_tco2e, location_based, market_based |
| `sbti_target` | Pathway commitment | id, baseline_fy, target_fy, reduction_pct, scope_subset |
| `financed_emission` | PCAF category | id, asset_class, attribution_factor, scope3_cat15 |

**Workflows.**

1. EF library seeded from IPCC AR6, India MoEFCC CEA grid factors (state-level), DEFRA cross-sector.
2. Scope 1: stationary + mobile + fugitive computed per facility from activity data.
3. Scope 2: dual reporting (location vs market) with REC application.
4. Scope 3: 15 categories with PCAF-aligned attribution; financed emissions for banks / NBFCs.
5. SBTi target tracking with linear / sectoral decarb path overlay.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| GET | /carbon/inventory?fy= | Latest inventory |
| POST | /carbon/recompute | Trigger recompute |
| GET | /carbon/factors?activity= | Available EFs |
| POST | /carbon/sbti-targets | Set target |
| GET | /carbon/pathway | Pathway data |

**UI surfaces.**

- Scope 1/2/3 stack chart
- EF library browser
- Pathway projector (RCP + SBTi)
- Financed emissions explorer (for FIs)

**Dependencies.** Inbound from Calculation Engine, Supplier Portal. Outbound to BRSR Report Builder, Dashboards.

**KPIs.**

- 100% facilities have at least Scope 1+2.
- < 1% variance vs. independently-recalculated inventory.
- All Scope 3 categories rated PCAF Score 1-3 on data quality.

---

## 12. AI Copilot

**Purpose.** A retrieval-augmented chat assistant that answers questions, drafts narratives, runs calculations on the fly, and produces ad-hoc analyses. Built on LangGraph with a 5-tool registry (rag.search, sql.query, calc.run, metric.lookup, file.cite) and Sonnet 4.7 as the planner.

**Key entities.**

| Entity | Purpose | Key columns |
| :--- | :--- | :--- |
| `copilot_session` | Conversation | id, user_id, started_at, last_msg_at |
| `copilot_message` | Message turn | id, session_id, role (user/assistant/tool), content, tool_calls JSONB |
| `copilot_citation` | Source pin | id, message_id, kind (metric / file / report), ref_id, snippet |
| `copilot_feedback` | Thumbs up/down | id, message_id, rating, comment |

**Workflows.**

1. User opens copilot panel; session created.
2. User asks a question (e.g. "Why did Scope 1 go up YoY?").
3. Planner decides tool sequence; tools invoked with structured args.
4. Streaming response back to UI with inline citation chips.
5. User clicks a chip → opens source in a side panel.

**API endpoints.**

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | /copilot/sessions | New session |
| POST | /copilot/sessions/:id/messages | Send message (SSE response) |
| GET | /copilot/sessions/:id | History |
| POST | /copilot/feedback | Rate |

**UI surfaces.**

- Floating chat panel (Cmd-K to summon)
- Inline citation chips
- "Apply suggestion" buttons (e.g. "Insert this paragraph into BRSR section X")
- Conversation history sidebar

**Dependencies.** Reads from all modules. No writes (except citation feedback).

**KPIs.**

- Daily active copilot users / weekly active platform users > 40%.
- Median answer latency < 6 s.
- Thumbs-up rate > 75%.
- 100% answers carry citations.

---

## Cross-module dependency graph

```
       Org Setup
           |
           v
       Materiality ----+
           |           |
           v           |
    Data Collection    |
           |           |
           v           |
     AI Extraction <---+
           |
           v
     Metric Registry <-----------+
           |                     |
           v                     |
    Calculation Engine           |
           |                     |
           +-> Carbon Accounting |
           |                     |
           +-> Supplier Portal --+
           |
           v
   BRSR Report Builder <---- Audit / Assurance
           |
           v
       Dashboards
           |
           v
       AI Copilot   (reads everything above)
```

