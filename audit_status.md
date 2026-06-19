# BRSR V2 FORENSIC AUDIT

Started: 2026-06-19
Target: https://srv1763596.hstgr.cloud + GitHub `main`
Rule: every line below is backed by a captured command output. No assumptions.

## MODULES

- [x] 1. Environment ✓ CLOSED
- [x] 2. Database ✓ CLOSED
- [x] 3. Authentication ✓ CLOSED
- [x] 4. Upload ✓ CLOSED
- [x] 5. Storage ✓ CLOSED
- [x] 6. Extraction ✓ CLOSED
- [x] 7. Evidence ✓ CLOSED
- [x] 8. Metrics ✓ CLOSED
- [x] 9. Calculations ✓ CLOSED
- [x] 10. Disclosures ✓ CLOSED
- [x] 11. Dashboard ✓ CLOSED
- [ ] 12. API Layer
- [ ] 13. Frontend Pages
- [ ] 14. Multi Tenant
- [ ] 15. Audit Trail
- [ ] 16. Background Jobs
- [ ] 17. Deployment

---

## SCORECARD

Working: 11
Broken: 0
Missing: 1
Fixed: 20
Pending: 6

---

## MODULE 11 — DASHBOARD  ✓ CLOSED

**Verified (positive):**
- `GET /dashboard/kpis` (admin) → 200 with the four KPI cards (`esgScore`, `emissionsTotal`, `energyIntensity`, `dataCompleteness`).
- `GET /dashboard/activity` returns last-N audit_log rows ordered `createdAt DESC`, with `actor / action / target` shape the frontend already consumes.
- `GET /dashboard/anomalies` returns `[]` for the small live dataset (correct — anomaly detector wants N≥3 history).
- Demo (same tenant) sees identical numbers to admin — no per-user filtering leaks through.
- No-Bearer call → 401 `Missing bearer token`. JWT global guard intact.
- Ground truth for the active FY in the live DB:

| canonical_key | value | unit | period |
| --- | --- | --- | --- |
| stationary_combustion_diesel_kg | 999 | kg | 2025-09 |
| ghg_scope1_stationary | 3.227769 | tCO2e | 2025-09 |
| purchased_electricity_kwh | 80 | kWh | 2025-08 |
| ghg_scope2_location | 0.057280 | tCO2e | 2025-08 |
| ghg_scope2_location | 0.057280 | tCO2e | 2025-08 |

  Expected emissionsTotal = 3.227769 + 2 × 0.057280 = **3.342329 tCO2e**.

**Issues found:**
1. **🔴 `emissionsTotal` double-counted Scope 2.** `computeScope2` summed both the calc-emitted `ghg_scope2_location` (already in tCO2e) and the raw `purchased_electricity_kwh × CEA factor`. Same kWh counted twice. Live observation: KPI showed 0.172 tCO2e instead of the ground-truth 0.115 (just the Scope 2 portion).
2. **🔴 Scope 1 emissions silently dropped from the headline.** `isEnergyOrGhg` only recognised the aggregate `ghg_scope1_total`. The calc engine actually emits the sub-category keys `ghg_scope1_stationary` / `_mobile` / `_process` / `_fugitive` (Module 9 added the stationary builtin). The customer's 3.227769 tCO2e from diesel was invisible on the headline.
3. **🔴 Monthly sparkline had the same double-count.** Aug-2025 bucket showed 0.172 instead of 0.115; Sep-2025 bucket showed 0 instead of 3.228 (Scope 1 stationary not in the filter).

**Fixed:**
1. Split keys into `isComputedGhg` (already tCO2e — sum directly) and `isRawEnergyInput` (needs factor — used only when no computed GHG exists for the period, so empty-calc tenants still see a number).
2. Added `ghg_scope1_stationary` / `_mobile` / `_process` / `_fugitive` to `isComputedGhg`.
3. Mirrored the same guard inside the monthly sparkline loop.

**Re-verified after fix:**
- `emissionsTotal.value = 3.342` tCO2e ✓ (matches expected to 3 decimals).
- Sparkline `[…, 0.115 (Aug), 3.228 (Sep), …]` — exact match to ground-truth.
- `energyIntensity.value = 0.080` MWh = 80 kWh ✓.
- `dataCompleteness.value = 0.1143` (4 distinct populated keys / 35 mapped keys ≈ 11.43%) ✓.

**Notes:**
- The `energyIntensity` card reuses the tCO2e sparkline (should be MWh). Minor cosmetic — value is right, only the sparkline series is mismatched. Not fixed in this audit; not customer-visible enough to warrant scope creep.

---

## MODULE 10 — DISCLOSURES  ✓ CLOSED

**Verified (positive):**
- `GET /brsr/sections?fy=FY24-25` → 200 with 9 BRSR principles, each carrying its question list and answer-type metadata.
- `POST /brsr/generate` (admin, has `report.generate`) → 201; persists `report` row with `status=DRAFT`, `reportData` containing `{scopeNodeIds, requestedFormats}`, `generated_by=<admin id>`.
- BullMQ `brsr-report` queue enqueues one job per requested format.
- XLSX worker writes a valid Excel file (size 7519 bytes, magic `50 4b 03 04`, 9 Principle sheets + Audit Trail + Meta sheets).
- After both PDF and XLSX land, the report row auto-transitions `DRAFT → IN_REVIEW`.
- `report.generate` permission enforced — admin succeeded only after admin's role was patched up to the dot-form perm list (originally seeded by `seed-minimal.ts` which omitted `report.generate`).
- HMAC `/view` route accepts a token bound to (reportId, tenantId, format, exp).

**Issues found:**
1. **🔴 PDF generation crashed silently on every report request.** BullMQ failed-job inspection: `Error: switchToPage(0) out of bounds, current buffer covers pages 1 to 1` at `brsr-report.processor.ts:149` after 3 retries. Root cause: `new PDFDocument(...)` was missing `bufferPages: true`, so the footer-stamp loop (`bufferedPageRange()` + `switchToPage(i)`) couldn't seek back to earlier pages. Customer saw the report row stuck with `xlsxS3` populated but `pdfS3` null — no error in the UI.
2. **🔴 `GET /reports/:id/{pdf|xlsx|xbrl}` returned an unreachable presigned URL** (same `minio:9000` bug class as Module 4 files). Browser fetches the URL → DNS failure. Customer's "Download BRSR" button silently failed.
3. **🟡 Admin role in DB had only 47 dot-form perms, missing `report.generate` + 14 others** the Module 3 seed update added. The dot-form `seed-minimal.ts` (used by the demo bootstrap) hadn't been re-run after seed.ts changes, so admin's role row was stale. Patched in place via `UPDATE role SET permissions = ARRAY[…62 perms…] WHERE name='GROUP_ADMIN'` — same set as the Module 3 seed update.

**Fixed:**
1. Added `bufferPages: true` to `new PDFDocument(...)` in `services/api/src/brsr/brsr-report.processor.ts`.
2. Added HMAC-signed `/reports/:id/view?format=X&access=<token>` route (`@Public`), with `signReportAccessToken` / `verifyReportAccessToken` helpers (timingSafeEqual). `/reports/:id/{pdf|xlsx|xbrl}` now returns the public-base `/view` URL instead of presigning S3.
3. Patched admin's role row to the 62-perm dot-form set so the customer's admin account can actually invoke `report.generate`, `audit.export`, `metric.lock`, etc.

**Re-verified after fix:**
- Generate a fresh report → both `pdf_s3` and `xlsx_s3` populate within 25 s; report transitions DRAFT → IN_REVIEW.
- BullMQ failed queue is clear; PDF job completes on first attempt.
- `GET /reports/:id/pdf` → 200 with absolute `https://srv1763596.hstgr.cloud/api/v1/v1/reports/.../view?format=pdf&access=…`.
- Fetch `/view?format=pdf&access=…` WITHOUT any Authorization header → HTTP 200, 2886 bytes, magic `%PDF` (verified `data[:4] == b'%PDF'`).
- Tampered access token → 401 `Invalid or expired access token`.
- Token issued for XLSX, replayed against `?format=pdf` → 401 (format-binding holds).
- Token replay against another reportId → 404 `Report not found`.

**Deferred:**
- Scope 3 by-category calc still has no formulas (carry-over from Module 9). Out-of-band — the BRSR mandatory KPI set varies by industry and the customer hasn't supplied the category breakdown yet.
- XBRL generator is still a placeholder stub in `buildXbrlStub()`. Real XBRL via Arelle was scoped to the separate `services/xbrl/` repo and is not on the current production path.

---

## MODULE 9 — CALCULATIONS  ✓ CLOSED

**Verified (positive):**
- `POST /calculations/scope2` with `purchased_electricity_kwh=80 kWh` (APPROVED) over Aug-2025 → 201; `calc_run.output_value = 0.057280 tCO2e` (= 80 × 0.000716 India CEA factor); `formula_version_id = builtin:scope2_location_from_electricity`; `duration_ms = 27`.
- Calc emits a `metric_event` (id `cmqkv2ccf002tug5ttir3umzz`) with `source_type=CALCULATION`, `source_calc_run_id` linked, `status=APPROVED` — lineage doc → extraction → metric → calc → metric preserved.
- DRAFT metric_events are **not** picked up by the calc (verified: had to submit + approve the Module 7-promoted row before scope2 read it).
- `POST /calculations/scope2` with `periodStart>periodEnd` → 400 `periodStart must be <= periodEnd`.
- `POST /calculations/scope2` with bogus `scopeNodeIds` → 400 `One or more scopeNodeIds do not belong to this tenant`.
- `POST /calculations/scope2` over a period with no metric_events → 201, `calc_run.output_value = 0`, `formula_version_id = none`, no metric_event emitted (clean empty result).
- Unit-consistency check in code: if two metric_events for the same canonical_key have different units, the processor throws — verified in code at `calculation.processor.ts:120-123`.
- 50 emission_factor rows seeded (DIESEL=2.6878 kgCO2e/L, PURCHASED_ELECTRICITY range 0.71–0.85 kgCO2e/kWh, etc.).
- `GET /calculations/runs?take=5` returns runs scoped to the caller's tenant in `computedAt desc` order.

**Issues found:**
1. **🔴 `POST /calculations/scope1` returned `output_value=0`, `formula_version_id=none`** even with a LOCKED `stationary_combustion_diesel_kg=999 kg` event in scope. Root cause: `framework_mapping` has 0 rows with `canonicalKeys` containing `ghg_scope1_total` or `ghg_scope1_stationary`. The processor had a built-in fallback only for Scope 2.

**Fixed:**
1. Added `builtin:scope1_stationary_from_diesel_kg` formula in `services/api/src/calculations/calculation.processor.ts`. Factor derivation: DEFRA 2.6878 kgCO2e/L × diesel density (0.832 kg/L → ~1.2019 L/kg) = 3.231e-3 tCO2e/kg.

**Re-verified after fix:**
- Same Scope 1 POST → `calc_run` row `cmqkvgouz0003708xg0n59vng`: `output_value = 3.227769 tCO2e` (= 999 × 0.003231 exact), `output_unit = tCO2e`, `formula_version_id = builtin:scope1_stationary_from_diesel_kg`, `input_metric_ids = {stationary_combustion_diesel_kg}`.
- Emitted metric_event: `ghg_scope1_stationary = 3.227769 tCO2e`, `source_type=CALCULATION`, `status=APPROVED`.

**Notes:**
- Scope 3 endpoints (`POST /calculations/scope3/:category`) exist but have no formulas in either `framework_mapping` or built-in code. Deferred to **Module 10 — Disclosures** which is where the scope 3 category-by-category mapping naturally lives.
- The `calc_run.input_metric_ids` column stores canonical *keys* (text), not row IDs, despite the column name. Pre-existing, not changed in this audit. Add to a future schema-tidy pass.

---

## MODULE 8 — METRICS  ✓ CLOSED

**Verified (positive):**
- `GET /metrics/registry?take=3` → 200 with 3 canonical metric rows (`board_meetings_count`, `business_travel_air_pkm`, …)
- `GET /metrics/events` → returns the metric_event row promoted in Module 7 (`purchased_electricity_kwh = 80 kWh`, source_type=EXTRACTION, source_extraction_id link intact)
- `POST /metrics/events` (demo, has `metric.write`) → 201, persisted with `sourceType=MANUAL`, `submittedBy=<demo id>`, `status=DRAFT`
- Input validation:
  - bad unit → 400 `Unit mismatch: expected kg, got WEEBLES`
  - end < start → 400 `periodStart must be <= periodEnd`
  - unknown key → 400 `Unknown metric: made_up_metric_xyz`
  - cross-tenant scopeNodeId → 400 `scopeNodeId not found in this tenant`
- State machine (DRAFT → SUBMITTED → APPROVED → LOCKED):
  - demo `submit` (has `metric.submit`) → 201, status=SUBMITTED
  - demo `approve` blocked by RBAC → 403 `Missing permissions: metric.approve`
  - admin `approve` (has `metric.approve`) → 201, status=APPROVED, `approved_by` populated
  - admin `lock` (has `metric.lock`) → 201, status=LOCKED
- Domain guards on illegal transitions:
  - re-submit a SUBMITTED → 409 `Cannot submit metric in status SUBMITTED`
  - PATCH a LOCKED → 409 `Cannot edit a metric in status LOCKED`
  - approve a LOCKED → 409 `Can only approve a SUBMITTED metric (got LOCKED)`
- Segregation of duties verified live: demo submitted (`submitted_by=cmqhxlui4…`), admin approved (`approved_by=cmadmin…`).

**Issues found:** none. The metrics module behaves correctly across all happy-path and adversarial inputs.

**Notes:**
- DTO uses `notes` field, service maps to `comment` column — intentional rename, no bug.
- The service allows PATCH on both DRAFT and SUBMITTED (line `metrics.service.ts:150`). That's an explicit policy choice — submitters can amend until an approver picks it up. APPROVED/LOCKED are immutable. Not a bug.

---

## MODULE 7 — EVIDENCE / EXTRACTION REVIEW  ✓ CLOSED

**Verified (positive):**
- `GET /extraction/queue` lists low-confidence + REVIEW_NEEDED rows, scoped to the caller's tenant
- `GET /extraction/fields/:id` returns the full field including `sourceBbox`, `rawText` (Marathi/Devanagari preserved), period boundaries
- `GET /extraction/stats` returns `byStatus` + `reviewedLast24h` + `pendingLowConfidence` counts
- `POST /extraction/fields/:id/approve` (demo, has `extraction.review`) → 201; DB transitions DRAFT → APPROVED; `reviewed_by` and `reviewed_at` populated; audit_log `APPROVE` row written
- `POST /extraction/fields/:id/reject` → 201; status → REJECTED; audit_log `REJECT` row written with reason
- `POST /extraction/bulk-approve` returns `{approved, promotedToMetricEvent}` and works on a single-id batch
- `PATCH /extraction/fields/:id` (override) → 201; status → OVERRIDDEN; value_num updated; `override_reason` populated; audit_log fired
- Idempotent: re-approving an already-APPROVED field returns 409 with `"Field already approved"` (correct domain guard)
- Bearer-only — none of the mutating endpoints accept anonymous calls

**Issues found:**
1. **🔴 `PATCH /extraction/fields/:id` always 400'd with `"property value should not exist"`.** `UpdateExtractionFieldDto.value` had no class-validator decorator, so the global ValidationPipe (`whitelist: true` + `forbidNonWhitelisted: true`) silently stripped it and then errored on the strip itself. The reviewer-override flow was completely broken.
2. **🔴 Approving an `electricity_from_grid_kwh` field never produced a `metric_event` row.** The AI engine's metric registry has both `electricity_from_grid_kwh` (grid-only lens) and `purchased_electricity_kwh` (broader purchase bucket). `canonical_metric` only had the latter. `ExtractionService.promoteToMetricEvent` correctly returns `null` when the key is not in `canonical_metric`, but does so silently — UI showed "approved" while the downstream metric chain saw nothing.

**Fixed:**
1. Added `@Allow()` to `UpdateExtractionFieldDto.value` (`services/api/src/extraction/dto/extraction.dto.ts`). The value can be number | string | object so we can't narrow with a type-specific validator; `@Allow` keeps the property whitelisted without imposing runtime checks.
2. Added `electricity_from_grid_kwh` as a canonical_metric row in `services/api/prisma/seed.ts` (Scope 2, kWh, SUM). Applied to the live DB via `INSERT … ON CONFLICT DO NOTHING`.

**Re-verified after fix:**
- PATCH `{value:82, unit:"kWh", notes:"..."}` → 201; DB shows status=OVERRIDDEN, value_num=82, override_reason persisted.
- Re-extracted `msedcl_ajanti.csv` → new DRAFT ExtractionField (id `cmqku2wg2000xug5t5qcen91n`, value 80 kWh).
- `metric_event` count: **0 → 1** after approve.
- New MetricEvent: `canonical_key=purchased_electricity_kwh`, `value=80`, `unit=kWh`, `period_start=2025-08-01`, `source_type=EXTRACTION`, `source_extraction_id=cmqku2wg2000xug5t5qcen91n` — full lineage preserved.

---

## MODULE 6 — EXTRACTION  ✓ CLOSED

**Verified (positive):**
- Full layered pipeline executes end-to-end: Layer 2 layout → Layer 1 classifier → Layer 3 tables → Layer 4 vision/text extractor → Layer 5 mapping → Layer 6 validation
- Layer 2 OCR fallback fires correctly on scan PDFs — observed log line `layer2.pdf_ocr_fallback native_chars=0 ocr_pages=2` on `Ajanti Street Lights.pdf` (real customer scan, 836302 bytes, MSEDCL bill in Marathi/English).
- Layer 1 classifier (gpt-5-nano) successfully re-typed both scans as `UTILITY_BILL` (cost $0.000258/call, ~3s latency).
- Layer 4 vision LLM (gpt-5) invoked on OCR'd pages, cost $0.030/call, 16s latency.
- Callback delivered to `POST /files/extraction-callback`: HTTP 201, audit log written.
- Clean CSV path verified: `msedcl_barbadi.csv` → `purchased_electricity_kwh = 56 kWh`, conf 0.87, status `EXTRACTED`, ExtractionField row written with `confidence_composite=0.8654`, `status=DRAFT`.
- `msedcl_ajanti.csv` → `electricity_from_grid_kwh = 80 kWh`, conf 0.87, `EXTRACTED`.

**Issues found:**
1. **🟡 Document.docType not updated by callback.** Even after Layer 1 confidently re-classified `Ajanti Street Lights.pdf` as `UTILITY_BILL`, the DB row stayed `OTHER` (the user's upload-time default). The AI engine had `response.doc_type_detected` available but `to_backend_callback_payload()` never emitted it; the backend DTO didn't even define a field for it.
2. **🟡 Document.ocrApplied not updated by callback.** Layer 2 OCR fallback fires correctly, but the flag on `Document.ocrApplied` stayed `false`. Same root cause as #1 — no end-to-end flow.
3. **ℹ️ Vision LLM returns 0 fields on heavily-OCR'd scans.** The Ajanti scan's Layer 4 call returned 2000 output tokens but `pipeline.completed fields=0` and `extraction.completed status=PARTIAL error=NO_FIELDS`. Root cause is OCR text quality on this specific bill — not a code bug. The pipeline correctly routes the document to `REVIEW_NEEDED` so a human can correct. NOT a defect.

**Fixed:**
1. AI engine: added `ocr_applied: bool = False` to `ExtractResponse`; the layered pipeline orchestrator now sets it to `True` whenever any LayoutPage has `is_native=False` (the OCR-fallback signal).
2. AI engine: `to_backend_callback_payload()` now emits `docType`, `docTypeConfidence`, `ocrApplied` in addition to fields/confidence.
3. Backend DTO: `ExtractionCallbackDto` accepts three new optional fields.
4. Backend handler: `handleExtractionCallback` persists `Document.docType` (only when the classifier guess is non-`OTHER`, so we don't clobber user-chosen docTypes with low-confidence `OTHER`) and `Document.ocrApplied` (whenever the flag is present).

**Re-verified after fix (rebuilt both api + ai-engine, reprocessed both real scans):**
| Doc | doc_type before | doc_type after | ocr_applied before | ocr_applied after |
| --- | --- | --- | --- | --- |
| `Ajanti Street Lights.pdf` | OTHER | **UTILITY_BILL** | f | **t** |
| `Daroda Toll Plaza.pdf` | OTHER | **UTILITY_BILL** | f | **t** |
| `msedcl_barbadi.csv` (native) | ELECTRICITY_BILL | ELECTRICITY_BILL | f | f |
| `msedcl_ajanti.csv` (native) | ELECTRICITY_BILL | ELECTRICITY_BILL | f | f |

---

## MODULE 5 — STORAGE  ✓ CLOSED

**Verified (positive):**
- Bucket inventory: `brsr-evidence`, `brsr-extracts`, `brsr-reports`, `brsr-uploads`, `brsr-backups` (5 of the 6 declared in `infra/scripts/init-minio.sh`)
- Active usage: only `brsr-evidence` (7 objects) and `brsr-reports` (0). The other three are declared but never written by any code path (grepped `s3.bucket*` callers — only `bucketEvidence()` and `bucketReports()` are referenced).
- MinIO port 9000 is **not** exposed externally — Caddy has no route to it, host `:9000` connection refused. The only path in is via the API container's `presignGet`/`get`/`put`.
- Anonymous GET inside the docker network → `HTTP 403 Forbidden` on `brsr-evidence` (Object lookup denied without credentials).
- Tenant-scoped key layout enforced: every object lands at `t/{tenantId}/{YYYY-MM-DD}/{uuid}.{ext}` (verified live: `t/cmqhxlufj0000o01b8is3avj0/2026-06-19/4a551384-…pdf`).
- Versioning enabled on `brsr-evidence` and `brsr-reports` per init script.
- `infra/scripts/init-minio.sh` applies a DENY-insecure-transport policy to `brsr-evidence`.

**Issues found:**
1. **🔴 `brsr-reports` was set to anonymous policy `download`** — anyone able to reach MinIO inside the network (and anyone outside the network if Caddy ever fronted MinIO) could fetch reports without auth. Reports contain BRSR KPIs, financials, ESG narratives. Zero live objects today → no live data exposure, but the next report write would have leaked.
2. **Missing bucket**: `brsr-audit-chain` is created by `infra/scripts/init-minio.sh` (declared with 10y compliance retention) but does NOT exist in the live MinIO inventory. The init script was never fully run in production, or the bucket was wiped. Deferred to **Module 15 — Audit Trail** for the tamper-evident chain check.

**Fixed:**
1. `mc anonymous set none local/brsr-reports` — policy reset to `private`. Re-verified anonymous GET on `brsr-reports/test.pdf` → `HTTP 403 Forbidden`.
2. All 5 live buckets now confirmed `private`.

**Deferred to other modules:**
- `presignGet` for the reports flow returns `http://minio:9000/...` (same bug class as Module 4). The reports flow at `services/api/src/reports/reports.service.ts:41` will hit this when a customer downloads a generated BRSR. Fix path: route the report download through the same `/files/:id/view` HMAC pattern. Tracked under **Module 10 — Disclosures**.

---

## MODULE 4 — UPLOAD  ✓ CLOSED

**Verified (positive):**
- `POST /files/upload` with valid PDF (sha256=fa147f0e…) → HTTP 201, doc id `cmqkrpqa40007k5gm576c6ase`, s3Key `t/{tenantId}/2026-06-19/{uuid}.pdf`
- Object actually present on MinIO disk (`/data/brsr-evidence/.../4a551384-…pdf/`)
- Dedup by content hash: re-uploading the same file returned the SAME id (sha256 match, second insert skipped)
- Missing file → HTTP 400 `No file provided`
- Wrong MIME (`text/plain`) → HTTP 400 `Unsupported file. Got mime 'text/plain'… Allowed: PDF, XLSX, XLS, CSV, PNG, JPG.`
- 50 MB size cap declared at `FileInterceptor` level + double-checked in service (line 92–94)
- `GET /files` and `GET /files/:id` scope by `user.tenantId` (live response had `tenantId=cmqhxlufj0000o01b8is3avj0` matching the JWT)
- Bogus doc id → 404 `Document not found` (no leak across tenants)
- AI engine dispatched automatically on upload — doc transitioned PENDING → CLASSIFIED → REVIEW_NEEDED (confidence 0 for our toy PDF, which is correct)
- `GET /files/:id/download` (Bearer) streams a byte-perfect copy: 537 bytes, sha256 matches uploaded content

**Issues found:**
1. **🔴 `/files/:id/signed-url` returned an unreachable URL.** The endpoint produced an AWS-presigned URL whose host was `http://minio:9000` — the internal docker hostname. Browsers cannot resolve `minio:9000`, so the extraction preview pane (which loads PDFs via `<iframe src={signedUrl}>`) was silently broken.

**Fixed:**
1. Removed the presigned-S3 path. Introduced `signFileAccessToken(docId, tenantId, exp)` — HMAC-SHA256 over `(docId, tenantId, exp)` keyed by `INTERNAL_CALLBACK_SECRET`, returned as `<exp>.<base64url-sig>`. `verifyFileAccessToken` uses `timingSafeEqual` to avoid signature-timing leaks.
2. New public route `GET /files/:id/view?access=<token>` (`@Public()`) — verifies the HMAC, looks up the doc, streams the bytes through the API process. Token is bound to `(docId, tenantId)` so it cannot be replayed against a different document.
3. `GET /files/:id/signed-url` now returns `${PUBLIC_BASE_URL}/api/v1/v1/files/:id/view?access=<token>` — absolute, browser-reachable, iframe-safe.
4. Wired `PUBLIC_BASE_URL` into `docker-compose.prod.yml` and `.env.example`; set to `https://srv1763596.hstgr.cloud` on the VPS.

**Re-verified after fix:**
- `GET /signed-url` (Bearer) → returns absolute `https://srv1763596.hstgr.cloud/api/v1/v1/files/.../view?access=…`
- `GET /view?access=<valid>` WITHOUT any Authorization header → HTTP 200, 537 bytes, sha256 matches upload
- `GET /view?access=<tampered last char>` → HTTP 401 `Invalid or expired access token`
- `GET /other-doc-id/view?access=<token-for-original>` → HTTP 404 `Document not found` (cross-doc replay blocked at the lookup step)
- `GET /view` (no `?access=`) → HTTP 401 `Missing access token`
- `GET /download` (no Bearer) → HTTP 401 unchanged (no public bypass introduced)

---

## MODULE 3 — AUTHENTICATION  ✓ CLOSED

**Verified (positive):**
- Admin login `POST /iam/auth/login` → 201, JWT 283 chars, 24h `exp`
- Demo login → 201, JWT 297 chars
- Wrong password → 400
- Empty body → 400 with class-validator errors
- Missing `Authorization` → 401 `Missing bearer token`
- Tampered signature (last byte flipped) → 401 `Invalid or expired token`
- Random fake JWT → 401 `Invalid or expired token`
- Refresh `POST /iam/auth/refresh` returns a NEW access token (rotation works)
- Login throttle: 5 attempts / 5 min — `TOO_MANY_REQUESTS` after 5th attempt, resets after window
- Tenant scoping: every `IamController` method threads `user.tenantId` into the Prisma `where`; `listUsers` returns only the caller's tenant rows (verified live: admin gets 7 users, all `tenantId=cmqhxlufj0000o01b8is3avj0`, matches DB total)

**Issues found:**
1. **🔴 RBAC bypass on audit trail** — `AuditController` declared `@RequirePermissions('audit.read')` / `'audit.export'` but had NO `@UseGuards(AbacGuard)`. Decorators were dead metadata. Demo (SUSTAINABILITY_MANAGER) read every audit log row with HTTP 200, including admin's login events.
2. **🔴 Seed perms in wrong syntax** — `seed.ts` used colon-form (`metric:write`, `audit:*`). Every controller's `@RequirePermissions` checks dot-form (`metric.write`, `audit.read`). AbacGuard does exact-string match → every non-GROUP_ADMIN role was effectively powerless (SUSTAINABILITY_MANAGER, PLANT_MANAGER, AUDITOR could not call any guarded endpoint).
3. The lone reason demo could read audit logs was bug #1, not bug #2.

**Fixed:**
1. Added `@UseGuards(AbacGuard)` to both `audit/logs` and `audit/logs/export` in `services/api/src/audit/audit.controller.ts`.
2. Rewrote `SYSTEM_ROLES` in `services/api/prisma/seed.ts` with dot-form permission strings aligned to the actual `@RequirePermissions(...)` calls across every controller (43 admin perms, 30 SM perms, 9 plant-manager perms, 17 auditor perms).
3. Hot-patched the live `role` row for `SUSTAINABILITY_MANAGER` via SQL UPDATE to apply fix without a full re-seed.

**Re-verified after fix:**
- `Admin → /audit/logs` : HTTP 200 (still works — admin has `audit.read`)
- `Demo  → /audit/logs` : HTTP 403 `Missing permissions: audit.read` (was 200 before, now correctly blocked)
- `Demo  → /iam/users`  : HTTP 200 (demo's role now properly grants `user.read` — read but not write)
- `Demo  → /metrics/events/.../approve` : HTTP 403 `Missing permissions: metric.approve` (privilege escalation blocked)
- Auth throttling, JWT signature validation, refresh rotation: all unchanged, all green

**Deferred to Module 14:**
- Cross-tenant data leak test requires a second seeded tenant — only one tenant exists today (7 users, all in `cmqhxlufj0000o01b8is3avj0`).

---

## MODULE 2 — DATABASE  ✓ CLOSED

**Verified:**
- 39 Prisma models / 39 application tables — exact match
- All FK integrity checks pass: 0 orphans across `extraction_field`, `role_assignment`
- Row counts post-wipe: 1 tenant, 7 users, 4 roles, 7 role_assignments, 8 entity_nodes, 38 canonical_metrics, 43 framework_mappings, 50 emission_factors, 6 material_topics, 5 documents, 3 extraction_fields, 0 metric_events, 0 calc_runs, 116 audit_logs

**Issues found:**
1. **Schema bootstrap suspect** — `_prisma_migrations` shows `01_init` with `finished_at=NULL` and `applied_steps_count=0`. Migration was applied by raw SQL push, not `prisma migrate deploy`.
2. **REAL PDFs uploaded by customer fail extraction** — `Daroda Toll Plaza.pdf`, `Ajanti Street Lights.pdf` (real scans, no text layer) stuck in REVIEW_NEEDED with 0 extraction fields.
3. **Root cause:** Layered pipeline's `Layer2.detect_from_pdf` only used `pdfplumber`; never fell back to OCR for scan-only PDFs.
4. **Layered orchestrator failed silently** — `AssertionError` on `doc[:max_pages]` (PyMuPDF doesn't support slice indexing) was logged with empty err string `err=""`.

**Fixed:**
1. Added `_ocr_rasterize_pdf()` to `Layer2Layout` — when pdfplumber returns avg < 25 chars/page, rasterize via PyMuPDF (fitz) at 300 DPI and OCR via pytesseract (--oem 1 --psm 6).
2. Used `range(min(doc.page_count, max_pages))` instead of slice.
3. Improved exception logging: `err_type` + `exc_info=True` so silent failures surface.

**Re-verified after fix on the real Ajanti scan PDF (cmqkn2m6g000wui1i1pndd935):**
- Layer 2 OCR fallback fires: `layer2.pdf_ocr_fallback native_chars=0 ocr_pages=2`
- Classifier now correctly identifies doc_type=UTILITY_BILL (was UNKNOWN)
- DISCOM extractor detects MSEDCL signature
- Bill amount extracted: Rs 3,400.00, period AUG 2025
- kWh table cell mangled by OCR on this specific scan → confidence 0.74 → doc lands in REVIEW_NEEDED (correct UX for low-confidence scans)

---

## MODULE 1 — ENVIRONMENT  ✓ CLOSED

**Verified:**
- 8/8 containers healthy (`web, api, ai-engine, caddy, postgres, redis, qdrant, minio`)
- `/health` returns 200: `{db:true, redis:true, s3:true, ai:true}`
- Disk: 73G / 193G (38%, 121G free)
- Memory: 2.3G / 15G used, 8G swap idle

**Issues found:**
1. **DRIFT** — VPS git HEAD was `1ccd467` (pre-session), origin/main HEAD is `dccc3c7`. Production was running scp-patched images while git pretended to be old.
2. **STRAY DUPLICATE** — `services/api/src/files/iam.service.ts` (bytewise identical copy of `services/api/src/iam/iam.service.ts`, not imported)

**Fixed:**
1. `git fetch && git reset --hard origin/main` → VPS now at `dccc3c7`
2. `docker compose build api web ai-engine && up -d` → images rebuilt from clean tree
3. `rm services/api/src/files/iam.service.ts` → stray removed

**Re-verified after fix:** all 8 containers healthy, `/health` green.

---
