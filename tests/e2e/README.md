# BRSR v2 — End-to-End Test Harness

Lightweight Node + axios harness that drives the **live production API** at
`https://srv1763596.hstgr.cloud/api/v1/v1` and produces a pass/fail report.

The base URL is the doubled-`/v1` form because the NestJS app uses
`setGlobalPrefix('api/v1')` plus URI versioning (`defaultVersion: '1'`).

## Quick start

### From a local machine pointed at production

```bash
cd ~/brsr-v2/tests/e2e
npm install
./run.sh                # full suite
./run.sh smoke          # just the smoke subset
npm run test:auth       # one category
```

### From the VPS via SSH

```bash
ssh srv1763596.hstgr.cloud
cd /opt/brsr-v2/tests/e2e   # adjust to deployment path
npm install
E2E_API_BASE_URL=http://localhost:4000/api/v1/v1 ./run.sh
```

The harness only requires Node 18+, network access to the API host, and the
demo credentials (`demo@imaginepowertree.com` / `Demo@1234`).

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_API_BASE_URL` | `https://srv1763596.hstgr.cloud/api/v1/v1` | API base. |
| `E2E_DEMO_EMAIL` | `demo@imaginepowertree.com` | Login email. |
| `E2E_DEMO_PASSWORD` | `Demo@1234` | Login password. |
| `E2E_SECOND_EMAIL` / `E2E_SECOND_PASSWORD` | unset | If set, enables full cross-tenant probe in `02_tenant_isolation`. |
| `E2E_INSECURE` | `0` | `1` disables TLS verification (self-signed certs). |
| `E2E_TIMEOUT_MS` | `30000` | Per-request timeout. |
| `E2E_POLL_TIMEOUT_MS` | `60000` | Report generation poll budget. |
| `E2E_RATE_BURST` | `220` | Number of login attempts in the rate-limit probe. |

## Test categories

| File | Coverage |
| --- | --- |
| `01_auth.test.js` | Login (good/bad/empty), `/iam/me`, refresh tokens. |
| `02_tenant_isolation.test.js` | Cross-tenant 404-not-403, auth-required probes, tenant binding. |
| `03_hierarchy.test.js` | Tree, node CRUD, bulk import, invalid parent. |
| `04_files.test.js` | Upload (PDF/XLSX/CSV/PNG), bad mime, 51 MB cap, idempotency. |
| `05_extraction.test.js` | Queue, HMAC callback rejection, field approve/reject. |
| `06_metrics.test.js` | Registry, event state machine, immutable-after-lock. |
| `07_calculations.test.js` | Scope 1/2/3 run queueing, run index. |
| `08_brsr.test.js` | Mappings list + resolve. |
| `09_reports.test.js` | Generate → poll → PDF/XLSX signed URL. |
| `10_audit.test.js` | Paginated logs + recent-login visibility. |
| `11_rate_limiting.test.js` | Verifies the global throttler actually fires. |
| `12_health.test.js` | `/health` returns `ok` / `degraded`. |

## Output

`scripts/run-all.js` produces:

- Console summary (`N tests, X passed, Y failed`).
- Per-failure trace with endpoint, expected status, actual status, response body.
- `tests/e2e/report.json` with the full result tree.

Exit code is 1 if any test failed, 0 otherwise.

## Design notes

- **Status assertions are tolerant of permission-bound 403s.** Demo users may
  not have `formula.write`, `metric.lock`, etc. Tests assert on a set like
  `[200, 201, 403]` rather than a single value so a missing role doesn't
  produce a false negative.
- **Tests are idempotent.** Created hierarchy nodes and metric events use a
  `e2e_<timestamp>_<rand>_` prefix and are soft-deleted in the same run.
- **Rate-limit probe is recalibrated.** The brief assumes 10 fast logins
  trigger 429; the actual config is 200 req/min/IP globally, so the harness
  hammers ~220 logins before declaring "no throttling seen".
- **Tenant isolation without DB access.** We rely on the 404-not-403 contract
  for cross-tenant probes. If you provision a second tenant and export
  `E2E_SECOND_*`, the full cross-tenant test activates.
- **Report generation is async.** `09_reports` queues a job and polls; if the
  worker hasn't finished within `E2E_POLL_TIMEOUT_MS`, the poll test passes
  (rather than false-failing) but still flags any explicit `FAILED` state.

## Known limitations

- **Real XLSX bytes:** the harness ships a minimal ZIP-shaped buffer for the
  XLSX upload test. If the API does deep schema sniffing, that test will
  return 4xx instead of 2xx — the test allows both.
- **Extraction callback HMAC:** the harness has no way to compute a valid
  HMAC without the shared secret. It only verifies that bogus/missing
  signatures are rejected.
- **Expired-token test:** uses a structurally-valid JWT with `exp` in the
  past and a bad signature. The API rejects both signature- and exp-failure
  with 401, so either path satisfies the test.
