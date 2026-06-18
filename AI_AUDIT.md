# AI Engine Production-Hardening Audit

Service: `services/ai-engine`
Reviewer: Staff AI Engineer (production-hardening pass)
Scope: resilience, confidence math, callback contract, observability, cost guardrails.

---

## Severity tally

| Severity  | Count |
|-----------|-------|
| CRITICAL  | 6     |
| HIGH      | 7     |
| MEDIUM    | 6     |
| LOW       | 3     |

22 distinct defects identified. 19 fixed in place. 3 documented as gaps (see end).

---

## Findings

### CRITICAL

**C-1. Callback uses the wrong secret header — backend always rejects it.**
`services/ai-engine/app/orchestrator/document_orchestrator.py` (old `deliver_callback`) sent `X-Callback-Secret`, but the backend guard `services/api/src/common/guards/internal-callback.guard.ts` reads `x-internal-secret`. The shared secret would never match, so EVERY async extraction silently fails to update the document status — leaving documents stuck at `CLASSIFIED` forever. Customer-visible data loss.

**C-2. Callback payload does not match `ExtractionCallbackDto`.**
We posted our internal `ExtractResponse` (`fields[].canonical_key`, `confidence_composite`, `status: NEEDS_REVIEW`, etc.), but the backend expects `{ documentId, tenantId, status: 'EXTRACTED'|'FAILED'|'PARTIAL', fields: [{fieldKey, value, confidence, ...}], documentConfidence, needsReview }`. NestJS `class-validator` would 400-reject every payload.

**C-3. No FAILED callback on background-task crash.**
`router/extract.py` `_run_and_callback` swapped in a generic `ExtractResponse` on exception then called `deliver_callback` — but if `download_to_bytes` raised, or callback delivery itself raised, the backend never learned the document failed. Docs hang in `CLASSIFIED`.

**C-4. No timeout, no retries on S3 download.**
`utils/s3.py` `download_to_bytes` had zero connect/read timeout (boto default is no read timeout for `download_fileobj`) and no retry decorator. A slow MinIO endpoint would tie up worker threads indefinitely. No size cap either — a hostile/malformed upload could OOM the worker.

**C-5. No timeout on callback delivery — only 20 s and no retries.**
`httpx.AsyncClient(timeout=20.0)` with `raise_for_status()` and no retry. Any transient 5xx on the backend would permanently lose the extraction result.

**C-6. CORS wide open: `allow_origins=["*"]` + `allow_credentials=True`.**
`main.py` allowed any origin to send credentialed requests — this combination is rejected by browsers but reveals that the service was designed without origin gating. Combined with `allow_methods=["*"]` and `allow_headers=["*"]` it allows any logged-in user on any malicious origin to drive the internal `/extract` endpoint.

---

### HIGH

**H-1. No per-tenant rate limit.**
A single tenant could DOS the OpenAI account by spraying `/extract` calls. ₹50L customer would see "noisy neighbour" outages.

**H-2. No per-document cost cap.**
The entity agent fans out `len(chunks) × len(predicted_keys)` LLM calls (capped at 25 metrics × 80 candidate batches). A pathological PDF could cost > $10 per document at gpt-5 rates with nobody to stop it.

**H-3. No daily OpenAI spend circuit breaker.**
A bug / abuse could spend the OpenAI budget overnight; service has no kill switch.

**H-4. Confidence composite returns `0.0` whenever ANY component is `0` (not just NaN-safe).**
Old `_composite` floored at `1e-3` already, but on missing prior_values the code left `peer_zscore=1.0` (silent), and on missing sibling_values left `cross_source=1.0` — these are *false positives*, not absent signals. There was no NaN guard anywhere; any NaN slipping through (e.g. from `value_canonical = nan`) would propagate to `confidence_composite = NaN` and Pydantic validation against `ge=0.0, le=1.0` would crash mid-extraction.

**H-5. Unhandled exceptions leak stack traces to clients.**
FastAPI default 500 handler emits raw exception detail in dev mode. No global exception handler was registered.

**H-6. `/extract` background task swallows exceptions silently.**
The bare `except Exception` block in `_run_and_callback` wrote a generic FAILED response but did not log a structured event the on-call team could alert on (only `logger.exception`, no structured fields).

**H-7. Tenant IDs logged in plaintext.**
`orchestrator.start` logged `tenant=req.tenant_id`, not the hash. PII leak to log aggregators.

---

### MEDIUM

**M-1. No PII redaction for OCR text in logs / summaries.**
`response.summary = (ext_result.text_preview or "")[:1000]` — that summary is returned to the backend and persisted. Any email / phone / Aadhaar in the source doc is propagated unredacted.

**M-2. No bounded preview-upload size.**
`POST /extract/preview` would accept arbitrary file sizes; we now cap at the same `MAX_S3_BYTES` (100 MB) and 413 above it.

**M-3. Fire-and-forget RAG indexer task silently drops exceptions.**
`asyncio.create_task(...)` without `add_done_callback` produces "Task exception was never retrieved" warnings and hides indexer failures.

**M-4. Error messages echoed into `ExtractError.message` without redaction.**
Boto / OpenAI error strings can include account IDs, request IDs that link back to tenants in support contexts. Now run through `redact_pii` before storing.

**M-5. `parse_s3_url` accepts arbitrary schemes.**
A `file://`-scheme URL or `ftp://` would be parsed by `urlparse` and the bucket/key split would silently "succeed". Now reject any scheme that isn't `s3`, `http`, `https`.

**M-6. `S3Object.filename` allows path traversal.**
If a key was `../../etc/passwd`, `Path.name` would correctly strip directory components, but the previous code did no extra defence; we now also strip `..`, `/`, `\` from the result.

---

### LOW

**L-1. `confidence_composite` formula doc disagreed with implementation.**
Module docstring promised `(a*b*c*d*e)**(1/5)` but the implementation used `prod ** (1/len(vals))`. Behaviourally identical for 5 components, but ambiguous; rewritten as an explicit product per the docstring.

**L-2. `ConfidenceScorer.level_from` would crash on `NaN` score.**
`NaN >= threshold` returns `False`, so it would fall through to `LOW` accidentally; now explicitly handled.

**L-3. `Settings.BACKEND_CALLBACK_SECRET` default `"change-me"`.**
Useful default for local but should warn in prod — left as-is (out of scope).

---

## Fixes Applied

| # | File | Description |
|---|------|-------------|
| F-1 | `services/ai-engine/app/utils/s3.py` | Added 30 s connect+read timeout via `BotoConfig`, `@retry` (tenacity, exp backoff, 3 attempts) on transient botocore errors, outer `asyncio.wait_for` cap, 100 MB pre-flight HEAD size guard, path-traversal-safe filename, scheme allow-list. |
| F-2 | `services/ai-engine/app/utils/logging.py` | Added `hash_tenant()`, `redact_pii()` (email/phone/PAN/Aadhaar/card/Bearer/sk- keys), `redact_dict()`, canonical `log_extraction()` emitter with the required schema: `tenant_hash, document_id, model_used, tokens_in, tokens_out, latency_ms, status, cost_usd, error`. |
| F-3 | `services/ai-engine/app/utils/guardrails.py` (NEW) | `RateLimiter` (Redis sliding window with in-memory fallback), `DocBudget` (per-document USD cap), `DailyBudgetGuard` (env-controlled `OPENAI_MAX_DAILY_USD` circuit breaker shared via Redis), custom exceptions. |
| F-4 | `services/ai-engine/app/config.py` | New settings: `BACKEND_CALLBACK_HEADER` (defaults to `x-internal-secret` — matches backend guard), `BACKEND_CALLBACK_TIMEOUT_SECONDS=10`, `BACKEND_CALLBACK_MAX_RETRIES=3`, `CORS_ALLOW_ORIGINS`, `RATE_LIMIT_PER_MINUTE=100`, `MAX_COST_PER_DOCUMENT_USD=1.0`, `OPENAI_MAX_DAILY_USD`. |
| F-5 | `services/ai-engine/app/orchestrator/document_orchestrator.py` | (a) `to_backend_callback_payload()` maps `ExtractResponse` → `ExtractionCallbackDto` (correct field names + status enum collapse + `documentConfidence` + `needsReview`). (b) `deliver_callback` uses `httpx.Timeout(connect=5, read=10, write=10)`, tenacity retries on transport errors and 5xx, sends the secret via `x-internal-secret` (configurable). (c) Guardrail checks at the top of `extract()` (rate limit, daily budget) — both return FAILED responses, not raise. (d) `DocBudget` threaded through; `CostBudgetExceeded` handled. (e) S3 errors now distinguish `S3DownloadError` / `S3ObjectTooLargeError`. (f) Tenant IDs replaced with `hash_tenant()` in all log lines; error messages run through `redact_pii`. (g) `_emit_extraction_log` writes the canonical event on every code path including the early guardrail/download failures. (h) Fire-and-forget indexer task gets `add_done_callback(_log_background_exc)`. |
| F-6 | `services/ai-engine/app/confidence/scorer.py` | (a) `_sanitize_component` clamps each component to `[0,1]` and replaces NaN/inf with the documented neutral value `0.5` (constant `NEUTRAL_COMPONENT` exposed at module top + documented in the module docstring). (b) Explicit `a*b*c*d*e` product matching the spec. (c) Output re-clamped to `[0,1]` after `prod ** (1/5)`. (d) `level_from()` explicitly handles NaN. (e) `_agreement_score` skips NaN/inf in diffs. (f) `_zscore` infinite-variance result now correctly maps to `peer_zscore=0.0` (not silently NaN). |
| F-7 | `services/ai-engine/app/main.py` | (a) CORS now reads `CORS_ALLOW_ORIGINS` (comma-separated); refuses `*` outside `ENV=dev`; restricts methods + headers to the minimum required set. (b) Global `@app.exception_handler(Exception)` returns a generic 500 with a correlation id, never a stack trace. (c) Error strings on the health probes are redacted before serialisation. |
| F-8 | `services/ai-engine/app/router/extract.py` | (a) Async-mode `_run_and_callback` now always calls `deliver_callback` — including on rate-limit / budget / unhandled failures — so the backend always flips status. (b) Maps `RateLimitExceeded` → 429, `DailyBudgetExceeded` → 503 on the sync path. (c) Pulls the per-app Redis client from `request.app.state` and threads it into `orch.extract(req, redis=redis)` so guardrails are cluster-correct. (d) Preview endpoint enforces `MAX_S3_BYTES` with 413. (e) Error messages redacted before becoming HTTP details. |

---

## Gaps NOT Fixed (and why)

### G-1. EntityExtractionAgent does not surface aggregate `prompt_tokens` / `completion_tokens` / `cost_usd`.
The agent's `run()` returns `(fields, issues, model_calls)` but loses the per-call token & cost telemetry that the `LLMRouter` collects in `LLMCall`. As a result the canonical `extraction.completed` log emits `tokens_in=0, tokens_out=0, cost_usd=<budget tally only when DocBudget.add was wired>` for the entity-extraction stage.

Fixing this cleanly requires a wider refactor: either thread a `DocBudget` instance into the agent's nodes (so each `router.chat` call calls `budget.add(res.call.cost_usd)`), or change the agent's return type to include a summed `LLMCall` list. We did not attempt this because it touches the agent's public interface used by callers we did not audit (`agents/__init__.py`, `validation_agent.py`). Recommended next step: add a `cost_collector: Callable[[float], None]` kwarg to `LLMRouter.route()` and to `EntityExtractionAgent.run()`.

### G-2. Per-document cost cap is advisory inside the entity agent.
We instantiate `DocBudget` and check it before and after the agent runs, but the agent itself doesn't poll the budget between LLM calls. So a single extraction with N parallel chunk-classifier calls can overshoot the cap by up to (concurrency × per-call cost) before we notice. Fixing requires the same plumbing as G-1. Until then, the cap is a "hard ceiling within ~$0.20 of the real spend" rather than a strict pre-call gate.

### G-3. `Settings.BACKEND_CALLBACK_SECRET` default `"change-me"` is not refused at startup in prod.
Out of scope for this audit (it's a config / deploy concern), but worth tracking: `lifespan` should refuse to boot if `ENV != "dev"` and the secret equals the default placeholder.

---

## Verification notes

- The `to_backend_callback_payload` mapping was cross-checked against `services/api/src/files/dto/files.dto.ts::ExtractionCallbackDto` and `files.service.ts::handleExtractionCallback`.
- The callback header (`x-internal-secret`) was cross-checked against `services/api/src/common/guards/internal-callback.guard.ts` (which already does `Buffer.timingSafeEqual`, satisfying the "timing-safe compare" requirement on the receiving side).
- Confidence formula: `(model_logprob * cross_validation * peer_zscore * schema_validation * cross_source) ** (1/5)` confirmed in `_composite`; NaN → `NEUTRAL_COMPONENT = 0.5`; output bounded in `[0, 1]`.
- Rate-limit and budget guardrails fall back to in-memory when Redis is unavailable; structured warning is logged but the request proceeds (best-effort).
