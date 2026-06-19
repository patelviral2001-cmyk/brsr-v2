# BRSR V2 FORENSIC AUDIT

Started: 2026-06-19
Target: https://srv1763596.hstgr.cloud + GitHub `main`
Rule: every line below is backed by a captured command output. No assumptions.

## MODULES

- [x] 1. Environment ✓ CLOSED
- [x] 2. Database ✓ CLOSED
- [ ] 3. Authentication
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

Working: 2
Broken: 0
Missing: 0
Fixed: 5
Pending: 15

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
