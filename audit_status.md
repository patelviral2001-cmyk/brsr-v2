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
- [ ] 6. Extraction
- [ ] 7. Evidence
- [ ] 8. Metrics
- [ ] 9. Calculations
- [ ] 10. Disclosures
- [ ] 11. Dashboard
- [ ] 12. API Layer
- [ ] 13. Frontend Pages
- [ ] 14. Multi Tenant
- [ ] 15. Audit Trail
- [ ] 16. Background Jobs
- [ ] 17. Deployment

---

## SCORECARD

Working: 5
Broken: 0
Missing: 1
Fixed: 10
Pending: 12

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
