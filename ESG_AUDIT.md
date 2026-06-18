# ESG Framework & Calculation Engine Audit

**Auditor:** Staff ESG Domain Expert
**Scope:** `packages/frameworks/src/` and `services/api/src/calculations/`
**Date:** 2026-06-18
**Standards referenced:** SEBI BRSR 2022/2024, BRSR Core (Jul 2023 + amendments), GRI 2021, SASB Industry Standards, TCFD Final Recommendations (2017, revised 2021), IFRS S1 & S2, GHG Protocol Corporate Standard, IPCC AR6 WG1.

---

## 1. Findings

Severity legend: **CRITICAL** (wrong number reported), **HIGH** (audit failure / wrong scope), **MEDIUM** (incomplete or misleading), **LOW** (cosmetic / future-proofing).

### CRITICAL

**C1. BRSR P3.E.11.b ("Total recordable work-related injuries") maps to fatality counts.**
File: `packages/frameworks/src/frameworks/brsr.ts`. The disclosure asks for *total recordable injuries* (TRIFR / absolute count) but the registry maps it to `fatality_count_employees + fatality_count_contractors`. Fatalities are a separate sub-disclosure (P3.E.11.c). Any auto-populated BRSR report would massively understate recordable injuries.

**C2. BRSR P3.E.11.d ("High consequence injury or ill-health, excluding fatalities") maps to `occupational_disease_cases` only.**
The GRI 403-9 / BRSR definition is *severe injuries from which the worker cannot or is not expected to recover fully to pre-incident health within 6 months*. Occupational disease cases are a different concept (chronic ill-health) and are captured under GRI 403-10. The right canonical key is missing from the registry — no `high_consequence_injuries` metric exists. Result: the disclosure is silently wrong.

**C3. BRSR A.III.21 turnover-rate formula uses wrong denominator and divides by zero.**
`m.employee_turnover / m.employee_count_total * 100`. SEBI defines turnover *for permanent employees and workers*, so the denominator must be `employee_count_perm` (permanent headcount), not total (which includes contractors and temps). The formula also has no zero-guard; a freshly onboarded subsidiary with zero headcount crashes the run. **Fixed below.**

**C4. Calculation processor sums values with different units silently.**
`services/api/src/calculations/calculation.processor.ts` aggregates `MetricEvent`s by `canonicalKey` with `metricCtx[k].value.plus(m.value)` *without* checking that `m.unit` matches the prior unit. Two events keyed `electricity_kwh` arriving as `kwh` and `mwh` get summed numerically — yielding a number off by 1000×. Catastrophic for Scope 2. **Fixed below.**

**C5. Calculation processor pulls every MetricEvent in the period for the tenant.**
The `findMany` does not filter by `canonicalKey`. For a tenant with hundreds of thousands of events per quarter this is unbounded I/O, blocks the worker, and (in conjunction with C4) makes unit drift more likely. **Fixed below: filter by the union of inputs declared on the active formulas.**

**C6. Scope 2 location-based emissions never apply state-specific CEA grid factors.**
The calc engine resolves `EmissionFactor` rows by `code` (flat). The state-specific CEA table (`packages/frameworks/src/factors/cea-india.ts`) exists but is *not wired* into the formula evaluator. Today every kWh is multiplied by the all-India `0.716`. A Sikkim consumer (0.25) and a Jharkhand consumer (0.97) report identical Scope 2 — a 4× error. **Not fixed: requires adding a `state` dimension into `MetricEvent`/`EmissionFactor` resolution; flagged as gap.**

### HIGH

**H1. BRSR Core mis-tagging on Leadership indicators.**
`P6.L.1`, `P6.L.2` (Scope 3), `P6.L.7` were all marked `is_brsr_core: true`. SEBI's BRSR Core is the *assured Essential indicator* subset (49 KPIs across 9 attributes) for the top-1000 listed entities — Leadership disclosures are explicitly excluded. Tagging Leadership rows as Core falsely inflates the assurance scope. **Fixed below for the three identified rows.**

**H2. Scope 3 marked BRSR Core.**
SEBI BRSR Core does *not* include Scope 3. The platform claims Scope 3 is assured, which is incorrect against the 2023/2024 BRSR Core formats. **Fixed via H1.**

**H3. GRI 405-2 ratio formula has no divide-by-zero guard.**
`m.median_remuneration_female / m.median_remuneration_male`. A unit with zero male median (single-gender team, or unfilled data) crashes. **Fixed below with ternary guard.**

**H4. GRI 401-1 formula incorrectly adds new hires to turnover.**
`m.employee_new_hires + m.employee_turnover` is semantically wrong: hires and exits are reported separately (and the disclosure type is a TABLE, not a NUMERIC). A net-flat company would appear to have churn equal to 2× hires. **Fixed below by nulling the formula and letting the TABLE renderer use both metrics.**

**H5. BRSR registry has no `brsr_core_attribute` tag.**
The standard groups the 49 KPIs into 9 attributes (e.g. *GHG footprint*, *Water footprint*, *Employee well-being & safety*, *Gender diversity*, *Inclusive development*, *Fairness in engaging with customers and suppliers*, *Open-ness of business*). `BrsrDisclosure` has only a boolean. Consumers cannot group Core KPIs by attribute for the SEBI mapping report. **Not fixed: enum addition; flagged as gap.**

**H6. P2.L.2 recycled-input formula divides by zero when both numerator and denominator are zero.**
`recycled / (recycled + virgin) * 100`. A non-manufacturing services entity has both at 0. **Fixed below with `>0` guard.**

**H7. P1.E.1 anti-corruption training conflates with general NGRBC training coverage.**
`anticorruption_training_pct` and `training_coverage_pct` are both mapped, but P1.E.1 specifically asks for *coverage of training programmes on principles covered by NGRBC*. Anti-corruption training is a subset, not the answer. The narrative also misleads. **Not fixed: clarification of canonical keys; flagged.**

### MEDIUM

**M1. P6.E.1 energy disclosure relies on a derived metric `total_energy_consumed_gj` instead of computing from sources.**
The formula returns the pre-derived `total_energy_consumed_gj` rather than `electricity_kwh*0.0036 + diesel_l*EF_diesel + …`. If `total_energy_consumed_gj` is not populated, the disclosure silently shows the wrong value. Should be a calculated metric driven by a formula in the formula registry, with the canonical key as its output.

**M2. P6.E.3 water-withdrawal formula sums the components AND maps `water_withdrawn_total_kl`.**
Risk of double-counting when both the parts and the rolled-up total are populated by a user. The formula should be: prefer `water_withdrawn_total_kl` if present, else sum the parts. Same pattern affects `electricity_kwh` vs the split renewable/grid sub-keys.

**M3. Calculation processor persists `CALCULATED` MetricEvents at `status: 'APPROVED'`.**
Workflow-wise this skips the assurance review queue. For BRSR Core (which must be reasonably-assured) the right default is `PENDING_REVIEW` so the assurance team can sign off before lock.

**M4. CEA factor lookup not punctuation-tolerant.**
`cea-india.ts::STATE_INDEX` is case-insensitive but a user typing `Tamilnadu`, `J&K`, `NCT of Delhi`, or `Orissa` (old name) falls through to all-India. Affects accuracy of state-level Scope 2.

**M5. CEA `Eastern` regional OM = 0.93 vs `Bihar` = 0.95 and `Jharkhand` = 0.97.**
The regional average should be between the state extremes (0.92–0.97); 0.93 is at the low end. Verify against CEA v18 official Table 9 — the value looks copy-from-Odisha rather than a weighted regional average.

**M6. DEFRA `lpg` row stored as `kg` but Indian BRSR seed/canonical metric `lpg_kg` accepts cylinder units (14.2 kg, 19 kg). Conversion at ingest is implicit.**
If a tenant uploads "240 cylinders of LPG" the unit `cylinder_14_2kg` must be converted. The processor's unit-mismatch fix (C4) will now correctly fail rather than silently mis-sum, but a conversion layer is still missing.

**M7. IFRS S2.29(d) industry-based metrics mapped only to a single intensity key.**
S2 mandates SASB-derived industry-specific metrics. The mapping should compose with `getSasbBySector(sectorCode)`. **Partially fixed below by widening the canonical key set; full fix needs sector-driven runtime composition.**

**M8. Scope 1 fugitive GWP defaults are documented as AR6_100 but the DEFRA seed for refrigerants uses AR5 values.**
`prisma/seed.ts` lines 1463–1466 list R410A=2088 and R134A=1430 with `gwpBasis: 'AR5'`. Canonical metric `scope1_fugitive_tco2e` declares `gwp_basis: "AR6_100"`. Result: fugitive emissions get computed with AR5 values but reported as AR6_100. Either restate the seed to AR6_100 (R410A=2256, R134A=1530) or expose the gwp basis on the per-event metadata.

**M9. CEL evaluator `coalesce` is permissive on `null` but the registry has no `null`-tolerant arithmetic.**
A null Scope 3 category will propagate `null` through `sum + null`. The fixed formulas should use `coalesce(m.scope3_cat1_tco2e, 0)` rather than bare references — current Scope 3 sums will crash on a single missing category.

### LOW

**L1. SASB `EM-IS-120a.1` air emissions canonical mapping excludes manganese and lead despite the question text listing them.**
No `manganese_kg` / `lead_kg` canonical metrics exist. Acceptable for v1; add as the steel-sector POC matures.

**L2. TCFD pillar enum is `RiskManagement` / `MetricsTargets` (no separator).**
Cosmetically inconsistent with `Governance` / `Strategy`. UI labels are fine but the enum hurts serialization to JSON columns in BI tools.

**L3. `BRSR_DISCLOSURES.expandSubBreakouts` flags every P6 sub-breakout `is_brsr_core: true`.**
Sub-breakouts like `P6.E.10.f` (radioactive waste) are not in BRSR Core unless the parent disclosure is and the sub-category is material. Over-inclusive flag; net impact small because Core is a superset.

**L4. `getCeaFactor` returns regional fallback by year but ignores the `state`.**
When the state is unknown and the year is known, it picks the year fallback; when both are unknown it falls back to all-India 0.716 from the 2024 record set even for, say, 2018 calculations. Use `CEA_ALL_INDIA_HISTORY[year]` as the primary fallback.

**L5. GWP_AR5 has `CH4 = 28` and `CH4_FOSSIL = 30`.**
IPCC AR5 published 28 for non-fossil CH4 and 30 for fossil. Correct, but the documentation comment should clarify that "CH4" here is the non-fossil default. Same applies to AR6_100Y (`CH4 = 27.9`).

---

## 2. Fixes Applied

| # | File | Change |
|---|------|--------|
| C1 | `packages/frameworks/src/frameworks/brsr.ts` (P3.E.11.b) | Re-mapped from fatality counts to `trifr`; updated formula and narrative to reflect *recordable injuries*. |
| C3 | `packages/frameworks/src/frameworks/brsr.ts` (A.III.21) | Changed denominator from `employee_count_total` to `employee_count_perm`; added ternary divide-by-zero guard. |
| C4 + C5 | `services/api/src/calculations/calculation.processor.ts` | (a) Pre-restrict the `MetricEvent` query to the union of `formula.inputs` keys; (b) Throw on unit mismatch when aggregating events for the same canonical key — prevents silent kWh+MWh corruption. |
| H1/H2 | `packages/frameworks/src/frameworks/brsr.ts` (P6.L.1, P6.L.2, P6.L.7) | Set `is_brsr_core: false` on Leadership indicators; added explanatory comments. |
| H3 | `packages/frameworks/src/frameworks/gri.ts` (GRI 405-2) | Added `> 0` ternary guard around the median-remuneration ratio. |
| H4 | `packages/frameworks/src/frameworks/gri.ts` (GRI 401-1) | Removed semantically-wrong `new_hires + turnover` formula; left as TABLE with both metrics surfaced. |
| H6 | `packages/frameworks/src/frameworks/brsr.ts` (P2.L.2) | Added zero-guard to the recycled-vs-virgin material ratio. |
| M7 (partial) | `packages/frameworks/src/frameworks/ifrs.ts` (S2.29(d)) | Widened canonical key set with universal intensity metrics; full sector-driven composition still pending. |

---

## 3. Gaps NOT Fixed

| # | Why not fixed |
|---|---------------|
| C2 — missing `high_consequence_injuries` canonical metric | Adding a canonical metric is a registry-schema change with downstream impact on ingest pipelines, AI extractor aliases, dashboard queries, and seed migrations. Out of scope for a formula audit; requires a separate metric-registry PR with valid_from migration. |
| C6 — Scope 2 location-based not state-weighted | Requires (a) `state` dimension on `MetricEvent`, (b) a CEA factor lookup pass in the processor that joins per-event state to `getCeaFactor`, (c) updating the Scope 2 formula to `sum(state.kwh × factor(state))` rather than `kwh × national_factor`. Multi-file change touching schema and ingest; logged for a dedicated Scope 2 sprint. |
| H5 — `brsr_core_attribute` enum | Schema change on `BrsrDisclosure`. Needs business sign-off on which of the 9 attributes each Essential row maps to (there is ambiguity between "Employee well-being" and "Health & Safety" for a few rows). |
| H7 — P1.E.1 mapping clarification | The right answer requires a new canonical key `ngrbc_training_coverage_pct` distinct from `anticorruption_training_pct`. Registry change. |
| M1 — P6.E.1 derived metric | Requires adding a Formula seed (`total_energy_consumed_gj = electricity_kwh*0.0036 + diesel_l*0.0357 + …`) and changing the disclosure to depend on the Formula's `outputKey`. Larger change. |
| M2 — double-counting risk in P6.E.3 / P6.E.1 | Needs a "rolled-up vs decomposed" precedence policy and ingest-layer dedup. |
| M3 — auto-approved CALCULATED events | Workflow-level decision; needs assurance-team input. |
| M4 — state-name normalisation | Requires a state-name canonicaliser library (handle "J&K", "Orissa"→"Odisha"). |
| M8 — Refrigerant GWP basis mismatch (AR5 in seed vs AR6_100 in canonical) | Decide whether to restate historical filings to AR6 or keep AR5 with explicit per-event `gwp_basis`. Policy call. |
| M9 — null-tolerant Scope 3 sums | Should be applied across the Scope 3 sum in `brsr.ts`, `gri.ts`, `tcfd.ts`, `ifrs.ts` by wrapping each term in `coalesce(m.scope3_catN_tco2e, 0)`. Recommend a follow-up PR. |

---

## 4. Emission Factor Library Gaps

| Gap | Impact |
|-----|--------|
| **CEA factors not wired to evaluator.** State-level table exists but the calc processor never calls `getCeaFactor(state)`. | All Indian Scope 2 location-based numbers are inaccurate. |
| **No PNG/CNG per-unit factors in DEFRA seed.** Indian Scope 1 stationary often runs on PNG; seed only carries `natural_gas` per kWh. | Manual user conversions; error-prone. |
| **Refrigerant table covers only R-134a, R-410A, R-32, R-23.** Common Indian chillers run R-407C, R-404A, R-507A — present in `ipcc-gwp.ts` but not in the DEFRA refrigerant seed. | Fugitive emissions under-counted for HVAC-heavy portfolios. |
| **No biogenic CO2 split.** `biomass_solid` carries a 26.8 kgCO2e/tonne factor (CH4/N2O of combustion) — biogenic CO2 itself is reported separately under GRI 305-1 footnote. Today the platform has no `scope1_biogenic_tco2e` companion metric. | Cannot reconcile with GHG Protocol biogenic guidance. |
| **No residual-mix factor for Scope 2 market-based.** Required by GHG Protocol Scope 2 Guidance for kWh not covered by an instrument (RECs/PPAs). | Market-based Scope 2 falls back to location-based, defeating the purpose of REC procurement reporting. |
| **No PCAF financed-emissions factors for Scope 3 cat 15.** | Banks/insurers cannot use the platform without manual factor uploads. |
| **No GLEC factors for Scope 3 cat 4 / cat 9 freight.** | Logistics-heavy clients fall back to DEFRA HGV average — not jurisdictionally accurate. |
| **AR5 vs AR6 inconsistency** (see M8). | Re-statement risk. |

---

## 5. Summary

- 6 CRITICAL, 7 HIGH, 9 MEDIUM, 5 LOW = **27 defects identified**.
- 8 defects fixed in this pass (C1, C3, C4, C5, H1/H2, H3, H4, H6, partial M7).
- 19 defects logged with rationale for deferral — mostly schema/migration changes, factor library additions, or workflow policy calls.
- The two most expensive misses for end-customers are **C6 (state-weighted Scope 2)** and **M1 (energy total not formula-driven)**; both should be on the next sprint.
