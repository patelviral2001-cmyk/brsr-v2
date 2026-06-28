# BRSR AI Platform — Roadmap

Eighteen-month build sequence, organised into six 3-month phases. Each phase has explicit gate criteria; we do not progress to the next phase until the current phase's gates are green. Hiring and customer rollout plans accompany each phase. Feature flag strategy lives at the end.

Authoring: Head of Product + VP Eng. Reviewed at the end of each phase by the executive team and our design-partner advisory board. Last reviewed 2026-06-16.

---

## Phase 1 — Q3 2026 — Foundations and BRSR Core MVP

**Theme.** Get a single design-partner tenant from "no platform" to "BRSR Core lodged with SEBI" end-to-end. Solve the hardest problem first: AI extraction with audit-grade lineage.

**Scope.**

- Org Setup (Module 1) full
- Materiality (Module 2) — survey + matrix; signoff stub
- Data Collection (Module 3) full, with manual + file paths
- AI Extraction (Module 4): top 80 BRSR Core metrics, English-only docs, single-page bill format
- Metric Registry (Module 5) for BRSR Core only
- Calculation Engine (Module 6): linear formulas, no DAG-of-DAGs yet
- BRSR Core Report Builder (Module 9): sections 1-9, PDF only (XBRL stub)
- Basic dashboards (Module 10): readiness gauge, scope 1+2 chart
- Audit hash chain v1
- Multi-tenant Pool tier only (no Silo yet)
- Region: ap-south-1
- 5 design-partner tenants

**Gate criteria to advance to Phase 2.**

- 5 design partners onboarded; 3 of them have lodged a real BRSR Core with SEBI through the platform.
- AI extraction autocommit rate >= 60%, HITL median decision < 3 min, hallucination rate (caught) < 1%.
- p95 dashboard load < 2.5 s.
- 0 SEV-1 incidents in 60 days.
- NPS from design-partner cohort >= 35.

**Hiring this phase.** Already in place: 4 backend, 3 frontend, 2 ML, 1 DevOps. Add: 1 SRE, 1 Product Designer, 1 CS lead.

**Customer rollout.** 5 design-partner pilots, hand-held. Each pilot gets weekly check-ins from a CS lead + the head of product.

---

## Phase 2 — Q4 2026 — BRSR Comprehensive, GRI, and Materiality GA

**Theme.** Broaden the framework coverage and harden materiality. Move from "we can file BRSR Core" to "we are the BRSR + GRI platform of record".

**Scope.**

- BRSR Comprehensive (full 15 principles)
- GRI 2025 Universal + topic standards (top 30 topics)
- Materiality (Module 2) GA: DocuSign integration, board signoff, framework signoff anchor
- Metric Registry: add BRSR Comp + GRI metric definitions (~600 more)
- iXBRL generator GA
- AI Extraction: handle multi-page bills, mixed Hindi/English (tested on Bharat Petroleum-style bills), Tamil pilot
- Silo tenant tier (per-tenant schema) — required for the first 3 Enterprise sales
- HITL UI polish: bulk-approve, re-extract with newer prompt, side-by-side compare
- Dashboards expansion: materiality matrix, peer-percentile cards (seeded from anon CDP data + ClickHouse benchmarks)
- Public-facing supplier-portal stub (not feature-complete)
- Region option: ap-south-2

**Gate criteria.**

- 20 paid tenants live (mix: 12 Compliance, 8 Enterprise).
- BRSR Comprehensive filed by at least 3 customers (top-250 list).
- Autocommit rate >= 70%, GRI mapping completeness 100% for the 30 selected topics.
- Materiality cycle median time < 4 weeks (industry: 14).
- Zero cross-tenant data leaks in fuzzing / RLS tests.
- SOC 2 Type I readiness window started.

**Hiring this phase.** +3 backend, +2 frontend, +1 ML, +1 SRE, +2 CS, +2 AE (mid-market), +1 Solution Architect, +1 Security Engineer.

**Customer rollout.** 20 paying tenants. Begin scheduled webinar series for the next 100 prospects.

---

## Phase 3 — Q1 2027 — Carbon Accounting + Supplier Portal GA

**Theme.** Own the carbon story. Add Scope 1/2/3 to GHG-protocol grade, with PCAF support for financial institutions. Launch the supplier portal at GA quality with magic-link onboarding.

**Scope.**

- Carbon Accounting (Module 11) GA: Scope 1/2 with location + market dual, Scope 3 categories 1-15
- Emission Factor library seeded (IPCC AR6, India MoEFCC CEA, DEFRA)
- PCAF for finance customers (asset class attribution, financed emissions)
- SBTi target tracker and pathway projector
- Supplier Portal (Module 7) GA: questionnaire builder, AI-assisted invoice extraction, supplier scorecard
- ERP connectors: SAP ECC + S/4HANA, Oracle Fusion (priority order from pilot demand)
- CDP and DJSI auto-fill questionnaire submission
- Mobile evidence capture (Capacitor) launches for plant managers
- API access (REST + GraphQL) GA, with SDK in TS and Python

**Gate criteria.**

- 50 paid tenants (mix: 30 Compliance, 17 Enterprise, 3 Group).
- 2 financial-institution Group tenants signed (with PCAF use case).
- 60% supplier response rate for at least 5 tenants who have invited >= 100 suppliers.
- Scope 3 cat 1 (purchased goods) computed for 5 tenants with auditor-acceptable PCAF score.
- < 1% calculation variance vs. independently-recalculated inventories (sampled by Big-4 partner).
- AWS Marketplace listing live.

**Hiring this phase.** +3 backend, +2 ML (one focused on EF library + LCA), +2 frontend, +3 CS, +2 AE, +1 Sales Engineer, +2 Implementation Engineers.

**Customer rollout.** 50 paid tenants. First Big-4 referral deals close.

---

## Phase 4 — Q2 2027 — TCFD, IFRS S1/S2, Climate Scenarios

**Theme.** Climate-forward disclosure for forward-looking investors. The Big-4 partnerships want this; SEBI is signalling alignment with IFRS S1/S2.

**Scope.**

- TCFD: governance, strategy, risk management, metrics & targets — full
- IFRS S1 (general) + IFRS S2 (climate) — full
- Climate scenario analysis: RCP 2.6 / 4.5 / 8.5 + NGFS Net-Zero 2050; physical risk overlay using Munich Re / Marsh climate data partnership
- Transition plan workbench (Net-Zero pathway editor)
- Reports Builder: TCFD report templates, IFRS S2 disclosures
- AI Copilot improvements: variance analysis, "explain like I'm the CEO" mode, chart generation
- Cross-tenant peer benchmarking (anonymous, opt-in) using ClickHouse
- Per-tenant LLM cost dashboard
- SOC 2 Type II observation window in progress

**Gate criteria.**

- 100 paid tenants (45 Compliance, 40 Enterprise, 12 Group, 3 Listed Premium).
- TCFD filed by 10 customers; IFRS S2 by 5.
- Scenario analysis used in board materials for >= 5 customers.
- ISO 27001 audit completed (cert issued in next phase).
- Year-2 ARR run rate >= INR 60 Cr.

**Hiring this phase.** +2 backend, +2 ML, +3 frontend, +3 CS, +1 AE (enterprise), +1 CISO-track Security Lead, +2 Implementation, +1 Designer.

**Customer rollout.** 100 paid tenants. First Listed Premium customer goes live.

---

## Phase 5 — Q3 2027 — Group Consolidation and Assurance Workspace

**Theme.** Conglomerates need group consolidation; auditors need a real workspace. Big-4 partners can co-deliver assurance through the platform.

**Scope.**

- Group consolidation: subsidiary / JV / associate accounting methods, intercompany eliminations for Scope 3 cat 4 (upstream transport) and supplier overlap
- Assurance workspace (Module 8) GA: sample selection helper, finding editor, Ed25519 partner signoff, hash bulletin
- Cross-FY restatement workflow with restatement explanations baked into reports
- Auditor self-serve: external partners can register, get scoped read-only roles via SAML federation
- White-labelled assurance brand (custom domain, custom logo) for Big-4 partners
- Internal audit module (for the customer's own IA team)
- Pop-up "what changed since last freeze?" diff view
- Performance: 99.95% SLA delivered

**Gate criteria.**

- 3 Big-4 partner agreements signed (deliver assurance through platform).
- 15 customers have completed Big-4 assurance through the platform; partner NPS >= 50.
- Assurance freeze < 60s; auditor time-to-source < 30s.
- SOC 2 Type II attestation issued.
- ISO 27001 cert issued.
- 0 SEV-1 incidents in 90 days.

**Hiring this phase.** +2 backend, +1 ML, +2 frontend, +4 CS (some specialized in auditor onboarding), +2 AE, +1 Partner Manager, +1 SRE.

**Customer rollout.** 150 paid tenants. Big-4 partners drive ~30% of new pipeline.

---

## Phase 6 — Q4 2027 — EU CSRD/ESRS, Double-Materiality v2, Value-Chain Emissions

**Theme.** EU expansion. CSRD wave 2 / 3 reporters need a platform that does double-materiality natively. Strong overlap with Indian customers' export exposure.

**Scope.**

- CSRD / ESRS 1 + 2 + ESRS E1-E5 + S1-S4 + G1
- Double-materiality v2: explicit IRO (impacts / risks / opportunities) editor; financial vs. impact axes separated
- Value-chain emissions modelling: input-output (EORA / Exiobase) for sectors without supplier data
- EU data residency: eu-west-1 region GA
- German + French locale (next-intl)
- CSRD audit trail format (specific to ESRS readiness check)
- Optional integration: GHG Protocol Land Sector + Removals
- LLM-as-judge improvements: ensemble of 2 judges for high-stakes extractions
- Per-tenant prompt fine-tuning (RAG + few-shot from prior approved extractions)

**Gate criteria.**

- 5 EU customers signed (mix of subsidiaries of Indian MNCs + native EU mid-caps).
- CSRD-readiness assessment delivered to 20 customers.
- Year-3 ARR run rate >= INR 120 Cr.
- Blended gross margin >= 65%.
- LTV / CAC >= 5 across all tiers.

**Hiring this phase.** +3 backend, +2 ML, +3 frontend, +2 CS (incl. 1 EU-based), +2 AE (incl. 1 EU-based), +1 Country Manager EU, +1 Compliance Specialist (CSRD).

**Customer rollout.** 200+ paid tenants. EU pilots in flight.

---

## Cumulative Customer Rollout Plan

| Phase end | Tenants | New / phase |
| :--- | ---: | ---: |
| Q3 2026 (Phase 1) | 5 (pilots) | 5 |
| Q4 2026 (Phase 2) | 20 | 15 |
| Q1 2027 (Phase 3) | 50 | 30 |
| Q2 2027 (Phase 4) | 100 | 50 |
| Q3 2027 (Phase 5) | 150 | 50 |
| Q4 2027 (Phase 6) | 220 | 70 |

By the end of Phase 6, our cohort spans every tier, with EU footprint started. Year-4 plan (out of scope here) targets 500 tenants and INR 250 Cr ARR.

---

## Feature Flag Strategy

We use LaunchDarkly Federal (self-host, OSS via Unleash for non-sensitive customers; LaunchDarkly Federal for Listed Premium). Three flag classes:

### A. Release flags (short-lived)

- Wrap any in-flight code path.
- Default off in prod; on in staging.
- 30-day max lifetime; flag debt review every Friday.
- Removed after rollout to 100% prod with a stability window of 14 days.

### B. Experiment flags (medium-lived)

- For A/B tests on UX changes (e.g. new HITL queue UI vs. classic).
- Power calc done before launch; minimum sample size guard; analytics piped to ClickHouse.
- Auto-conclude after 30 days or when stat-sig is reached.

### C. Permission / tier flags (long-lived)

- Things like `feature.tcfd`, `feature.byok`, `feature.csrd`.
- Driven by tier and (sometimes) per-tenant overrides.
- Stored in `tenants.feature_flags` JSONB; cached in Redis 60 s; per-request override possible via JWT claim for support engineers.

### D. Kill switches

- For every external integration (Anthropic, Voyage, DocuSign, Qdrant Cloud, SES) we have a kill switch that:
  - Triggers automatic fallback (e.g. self-hosted bge-m3 if Voyage down).
  - Surfaces a banner: "AI Extraction degraded mode active — manual entries unaffected."
- Tested monthly in chaos drills.

### Rollout pattern for risky changes

1. Internal-only (1% of staff sessions) for 24 h.
2. 5% of design-partner tenants for 3 days.
3. 25% of Compliance + Enterprise tenants for 7 days.
4. 100% Compliance + Enterprise; Group + Listed Premium opt-in for 14 days.
5. 100% all tenants.

Each step has automated guard-rails (error rate, p95 latency, cost). Roll back if any guard-rail trips.

---

## Risk Register Tied to Roadmap

| Risk | Phase | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| SEBI changes BRSR schema mid-year | Any | M | H | Versioned MetricMapping; AI-assisted re-mapping flow; 2-week SLA for new schema support |
| Anthropic outage or pricing change | Any | M | H | Bedrock Anthropic backend; rate-throttle; per-tenant budget caps; bge-m3 fallback for embeddings |
| Big-4 build their own competitor | Phase 4+ | M | H | Deep co-sell partnership; integration-not-competition positioning; white-label assurance workspace |
| Reliance / Adani choose to build in-house | Phase 5 | L | M | Land smaller Group customers first; deliver wins fast |
| EU CSRD timeline slips | Phase 6 | M | M | Continue serving Indian + UK + APAC; not betting the company on CSRD |
| AI hallucinates a number that gets filed | Phase 2+ | L | Catastrophic | Five-layer prevention; mandatory HITL for low-confidence; insurance; audit chain catches it |
| Talent loss (key ML or backend) | Any | M | M | Equity refresh annually; documentation standards; on-call rotation prevents single-points |

---

## Open questions parked for review

- Should the Copilot be allowed write-side actions (e.g. "go approve this metric") under explicit user confirmation? Probably Phase 4 with strict audit.
- Should we offer an industry-vertical pack (steel, cement, pharma) with pre-built metric templates? Probably Phase 3 paid add-on.
- Should we partner with an LCA vendor (Sphera GaBi, ecoinvent) for product-carbon-footprint module? Phase 5+ evaluation.

