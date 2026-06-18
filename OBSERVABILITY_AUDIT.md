# BRSR AI Platform — Observability Audit

Date: 2026-06-18
Scope: `services/api/` logging, metrics, tracing, health, error tracking, SLOs
Deployment: <https://srv1763596.hstgr.cloud>

---

## 1. Logging

### L1.1 GOOD — Structured JSON logs via Pino
- `services/api/src/app.module.ts` configures `nestjs-pino` with JSON output
  in production and pretty output only when `NODE_ENV !== 'production'`.
- Every request log carries `tenantId`, `userId`, `requestId` via
  `customProps`.

### L1.2 GOOD — Secret redaction is wired
- Pino `redact.paths`:
  ```
  req.headers.authorization, req.headers.cookie, *.password, *.secret
  ```
  `remove: true`. No `console.log(env)`. `OPENAI_API_KEY` is never logged.

### L1.3 MEDIUM — Trace id is logged on errors only
- `AllExceptionsFilter` attaches `traceId` from OTel; the happy-path access
  log line does not include it.
- **Follow-up:** add `traceId: trace.getSpan(otelContext.active())?.spanContext().traceId`
  to Pino's `customProps`. Pulling the OTel API into every request log has a
  small CPU cost but materially helps cross-system debugging.

### L1.4 LOW — `spanId` not in log payload
- Same fix as L1.3 — `customProps` can return `traceId` and `spanId`. Tagged
  as a follow-up.

---

## 2. Metrics

### M2.1 CRITICAL gap (now fixed) — no Prometheus scrape endpoint
- **Fix applied (new module):**
  - `services/api/src/common/metrics/metrics.service.ts`
  - `services/api/src/common/metrics/metrics.interceptor.ts`
  - `services/api/src/common/metrics/metrics.controller.ts` — exposes
    `GET /metrics-prom` (Public, content-type `text/plain;version=0.0.4`).
  - `services/api/src/common/metrics/metrics.module.ts` (`@Global`).
- Wired in `app.module.ts`:
  - `MetricsModule` imported.
  - `MetricsInterceptor` registered via `APP_INTERCEPTOR`.
- `main.ts` already excludes `metrics-prom` from the `api/v1` global prefix.

### M2.2 Metrics exposed
- `http_requests_total{route,method,status}` — counter
- `http_request_duration_seconds{route,method,status}` — histogram, buckets
  `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`
- `extractions_total{status}` — counter
- `calc_runs_total{status}` — counter
- `report_generation_duration_seconds{report_type}` — histogram
- `auth_failures_total{kind,reason}` — counter
- Default Node metrics (event-loop lag, GC, memory, file handles) via
  `prom-client`'s `collectDefaultMetrics`.

### M2.3 GOOD — Labels are bounded
- We use the route template (`req.route.path`), not the raw URL, so we don't
  blow up cardinality with cuid path params.
- No `userId` or `tenantId` labels — those would explode cardinality and
  contain PII. Tenant slicing happens via tracing instead.

### M2.4 Follow-up — Wire business-event emitters
- `MetricsService.extractionsTotal.inc({ status })` should be called in
  `extraction.service.ts` and the post-extraction callback in `files.service.ts`.
- `MetricsService.calcRunsTotal.inc({ status })` in `calculations.service.ts`.
- `MetricsService.reportGenerationDuration.observe({ report_type }, sec)` in
  `reports.service.ts`.
- The HTTP metrics work end-to-end today; the business metrics are stubs
  ready to be `inc()`'d. Not wired in this pass to avoid touching every
  module — this is a focused follow-up.

### M2.5 Scraping — restrict at proxy
- The metrics endpoint is `@Public()` (Prometheus does not auth). In Caddy
  it MUST NOT be exposed to the public Internet. Today Caddy forwards
  `/api/v1/*` and `/graphql/*` to the API and routes the rest to Next.js —
  `/metrics-prom` is therefore implicitly behind the Next.js handler, which
  serves a 404. For an internal Prom scraper, scrape `api:4000/metrics-prom`
  via the Docker network. Adding an explicit deny rule for the public
  Caddyfile is a follow-up.

---

## 3. Tracing

### T3.1 GOOD — OpenTelemetry SDK wired and started before app boot
- `services/api/src/tracing.ts` initialises `NodeSDK` with OTLP HTTP exporter
  before any Nest module loads (required for auto-instrumentation).
- Disabled `@opentelemetry/instrumentation-fs` to avoid noisy spans.

### T3.2 GOOD — `traceId` propagated in error responses
- `AllExceptionsFilter` reads the active span and includes the trace id in
  both the response body (`response.traceId`) and the error log.

### T3.3 MEDIUM — `X-Trace-Id` not propagated outbound to AI engine
- **Risk:** Inability to follow a user request through the AI engine call.
- **Fix recommendation (out of scope for this pass — required change touches
  HTTP client config):**
  - Either configure OTel `propagator: 'tracecontext'` (auto W3C headers via
    the auto-instrumentation, already on by default) AND verify the AI engine
    propagates back, OR
  - Explicitly inject `X-Trace-Id: <traceId>` in `files.service.ts::dispatchExtraction`.
- Tagged TODO in OBSERVABILITY_AUDIT.md backlog.

### T3.4 GOOD — Exposed `x-request-id` and `x-trace-id` via CORS
- `main.ts`: `exposedHeaders: ['x-request-id', 'x-trace-id']` — the browser
  can read them, which makes user-reported bug triage much faster.

---

## 4. Health Checks

### H4.1 GOOD (now improved) — Deep health check on `/health`
- DB (`SELECT 1`), Redis (`PING`), S3 (`HeadBucket`), AI engine (`GET /health`).

### H4.2 NEW — `/health/live` and `/health/ready`
- `GET /v1/health/live` — pure process check, never depends on upstreams
  (so an upstream outage doesn't trigger pod restart loops).
- `GET /v1/health/ready` — DB + Redis check; returns `503` when not ready
  so an LB drains the pod.
- Both are `@Public()` so they bypass JWT.
- Today Caddy points its upstream check at `/health` (the aggregated one) —
  that still works. We recommend Caddy and any future k8s probes pin to
  `/health/live` for liveness and `/health/ready` for readiness.

---

## 5. Error Tracking

### E5.1 No Sentry / Honeybadger / similar today.
- `AllExceptionsFilter` logs the exception with full context (path, method,
  userId, tenantId, requestId, traceId) — that's a meaningful baseline but
  it's not the same as a dedicated error tracker (deduping, frequency, user
  impact, release tagging).
- **Recommended setup (out of scope for this pass):**
  1. `pnpm add -F @brsr/api @sentry/node @sentry/profiling-node`
  2. In `main.ts` (or a dedicated `sentry.ts` imported at top of `main.ts`,
     before `initTracing`):
     ```ts
     import * as Sentry from '@sentry/node';
     Sentry.init({
       dsn: process.env.SENTRY_DSN,
       environment: process.env.NODE_ENV,
       release: process.env.GIT_SHA,
       tracesSampleRate: 0.1,
     });
     ```
  3. In `AllExceptionsFilter`, after the existing log, add
     `Sentry.captureException(exception, { tags: { tenantId, route } })`.
  4. Set `SENTRY_DSN` per environment in the deploy secrets, NOT in
     `.env.production.example`.

---

## 6. SLOs

### Service-level objectives (proposed targets)

| Indicator                         | Target                | Notes                                    |
|-----------------------------------|-----------------------|------------------------------------------|
| Login p95 latency                 | **< 300 ms**          | Measured at `/iam/auth/login` only       |
| File upload p95 (excl. extraction)| **< 2 s**             | `/files/upload` request duration         |
| API availability                  | **99.9% / 30 days**   | 5xx error rate < 0.1%                    |
| Extraction success rate           | **> 95%**             | `extractions_total{status="EXTRACTED"} / sum` |
| Refresh-token reuse alerts        | **= 0 / week**        | `auth_failures_total{kind="refresh_reuse"}` |
| Audit-log anchor success          | **24h since last**    | Cron `audit-anchor` must run nightly     |

### Suggested Prometheus alerts (PromQL)

```promql
# API 5xx ratio over 5 min > 0.1%
sum(rate(http_requests_total{status=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m])) > 0.001

# Login p95 SLO breach
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{route="/iam/auth/login"}[5m]))
) > 0.3

# Refresh-token reuse detected
increase(auth_failures_total{reason="refresh_reuse"}[15m]) > 0

# Audit anchor stale (no new row in last 30h)
time() - max(audit_anchor_last_day_seconds) > 30 * 3600
```

(`audit_anchor_last_day_seconds` is not yet emitted — a one-line
`Gauge.set(Date.now() / 1000)` at the end of `runDailyAnchor()` makes the
last alert work. Tagged as a follow-up.)

---

## 7. Dashboards (Grafana)

Out of scope for this pass — `infra/k8s/grafana.yaml` exists but no
dashboard JSON shipped. Recommended boards:

1. **API gateway** — RED (Requests / Errors / Duration) per route, plus
   throttler rejection rate.
2. **Auth** — login success vs failure, refresh rotation, account-locks.
3. **Extraction** — `extractions_total` by status, AI-engine round-trip latency,
   queue depth (BullMQ).
4. **Tenants** — per-tenant usage (derived from logs via Loki, not Prom,
   to avoid label cardinality blow-up).

---

## 8. Audit-log integrity monitoring

The audit log has a hash chain + nightly Merkle anchor (`AuditService.runDailyAnchor`).
Tamper evidence is only useful if someone is checking — add a verifier job:

```sql
-- Periodic verifier (runs in an isolated read-only db role)
SELECT day, row_count, merkle_root, chained_root
FROM audit_anchor
ORDER BY day DESC LIMIT 30;
```

Hash each day's rows in id order, recompute the Merkle root, compare to
`merkle_root`. Recompute `sha256(prev_chained_root || merkle_root)` and
compare to `chained_root`. Page on mismatch.

---

## Files added / changed by this pass

```
services/api/src/common/metrics/metrics.service.ts        NEW
services/api/src/common/metrics/metrics.interceptor.ts    NEW
services/api/src/common/metrics/metrics.controller.ts     NEW
services/api/src/common/metrics/metrics.module.ts         NEW
services/api/src/health/health.controller.ts              +/live, +/ready
services/api/src/app.module.ts                            wire MetricsModule + interceptor
services/api/package.json                                 +prom-client
OBSERVABILITY_AUDIT.md                                    this file
```

## Backlog (not in this pass)

1. Add `traceId` + `spanId` to Pino `customProps` so every log line correlates
   to a trace.
2. Wire business metrics emitters in extraction/calc/reports services.
3. Restrict `/metrics-prom` exposure at the Caddy layer (explicit deny rule).
4. Inject `X-Trace-Id` on outbound AI-engine HTTP calls.
5. Sentry integration (see §5).
6. Emit `audit_anchor_last_day_seconds` gauge from `runDailyAnchor`.
7. Grafana dashboard JSON, checked in under `infra/k8s/grafana/`.
8. Per-tenant request volume visible in Loki (not Prom) to keep cardinality bounded.
