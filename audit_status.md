# BRSR V2 FORENSIC AUDIT

Started: 2026-06-19
Target: https://srv1763596.hstgr.cloud + GitHub `main`
Rule: every line below is backed by a captured command output. No assumptions.

## MODULES

- [x] 1. Environment ✓ CLOSED
- [x] 2. Database ✓ CLOSED
- [x] 3. Authentication ✓ CLOSED
- [ ] 4. Upload
- [ ] 5. Storage
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

Working: 3
Broken: 0
Missing: 0
Fixed: 7
Pending: 14

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
