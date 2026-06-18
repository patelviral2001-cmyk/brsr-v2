# BRSR AI Platform — Security Audit

Date: 2026-06-18
Auditor: Security Engineer + SRE pass
Scope: `services/api/` + `infra/caddy/` + `.env.production.example`
Deployment: <https://srv1763596.hstgr.cloud>
Customer value at stake: ₹50L+

This is a working audit doc — every Finding has a severity, every Fix points
at the file(s) changed in this pass, and unmitigated items are called out as
**Follow-up** so they don't quietly fall off the backlog.

Severity ladder:
- **CRITICAL** — exploitable in prod today, must ship now
- **HIGH** — exploitable under realistic conditions, ship this sprint
- **MEDIUM** — defence-in-depth weakness, ship next sprint
- **LOW** — hygiene / future-proofing

---

## 1. Authentication & Session

### F1.1 CRITICAL — JWT signing fell back to literal `'dev-secret'` when env was unset
- **File:** `services/api/src/iam/iam.service.ts`
- **Risk:** A misconfigured deploy mints tokens with a publicly known secret.
  An attacker who notices this can forge tokens for any tenant.
- **Fix applied:** New `IamService.getJwtSecret()` enforces `JWT_SECRET >= 32 chars`
  in production and throws `ServiceUnavailableException` otherwise. The
  fallback string is only reachable in non-prod.

### F1.2 HIGH — No refresh-token rotation; reuse goes undetected
- **Risk:** A stolen refresh token can be used forever (until 7d expiry) in
  parallel with the legitimate user, and we have no way to notice.
- **Fix applied:** Refresh tokens now carry a `jti` and family id. On every
  `/iam/auth/refresh` we rotate (new jti, same family), mark the old jti
  revoked, and if a revoked jti is ever presented again we burn the entire
  family (forces every device in the chain to re-authenticate). Refresh
  endpoint now also returns the new refresh token. See
  `iam.service.ts::refreshToken`.
- **Follow-up:** The rotation registry is in-process. For multi-replica deploys
  move `refreshTokenJtis` + `revokedFamilies` to Redis. Marked TODO in code.

### F1.3 HIGH — No brute-force protection on `/iam/auth/login`
- **Risk:** Credential stuffing / password spray on the credentials login.
- **Fix applied:**
  - Per-IP throttle: `@Throttle({ limit: 5, ttl: 5 * 60_000 })` on the login
    handler (iam.controller.ts).
  - Per-user account lockout: 10 failed attempts (configurable) → 15 min lock
    (configurable). Lockout key is normalized to lowercase email so casing
    doesn't bypass.
  - Failed logins are audited with `metadata: { result: 'FAILED', reason,
    attempt, locked }` so SIEM rules can fire.
- **Follow-up:** Move lockout state to Redis for multi-replica deploys.

### F1.4 MEDIUM — bcrypt cost not specified
- **Risk:** Whatever cost the seed script chose may be below modern recommendations.
- **Fix applied:** New `BCRYPT_COST` env (default **12**) used by
  `IamService.hashPassword`. Documented in `.env.production.example`.

### F1.5 MEDIUM — `loginWithCredentials` accepted unvalidated `{email, password}`
- **Risk:** No length cap, no email format check; trivially used for resource
  exhaustion (gigantic payloads, ReDoS through bcrypt with very long input).
- **Fix applied:** New `LoginDto`, `RefreshDto`, `LogoutDto` in
  `services/api/src/iam/dto/auth.dto.ts` with `@IsEmail`, `@MinLength(8)`,
  `@MaxLength(254/256/4096)`. Controller now binds to typed DTOs.

### F1.6 LOW — Refresh endpoint did not return a new refresh token
- **Fix applied:** It does now. Existing clients can still parse the response
  (we added `refreshToken` alongside the existing `token` field).

### F1.7 LOW — Schema has `mfaEnrolled` but no enrollment endpoint exists
- **Fix applied:** Added `POST /iam/mfa/enroll` stub that returns
  `{ status: 'not_implemented', userId }`. Audited so we can see who tried.
- **Follow-up:** Implement TOTP enrollment + verify flow (RFC 6238).

### F1.8 LOW — Logout has no server-side effect
- **Fix applied:** New `POST /iam/auth/logout` invalidates the presented
  refresh token's family so all devices in the chain forcibly re-auth.

---

## 2. Authorization (RBAC + ABAC)

### F2.1 CRITICAL — OPA disabled means ABAC is a NO-OP
- **File:** `services/api/src/common/utils/opa-client.ts` +
  `services/api/src/common/guards/abac.guard.ts`
- **Risk:** Original behaviour was `if (!enabled) return { allow: true }`,
  meaning every `@RequirePermissions(...)` decorator silently waved the
  request through whenever `OPA_ENABLED=false` (which is the *current
  production setting*). Tenant scoping still applied, but cross-role
  privilege checks were effectively disabled.
- **Fix applied:**
  - `OpaClient.isEnabled()` exposed so AbacGuard can route around it.
  - `AbacGuard` now contains an RBAC fallback: it loads the user's
    `RoleAssignment[]` (filtered to system roles or the user's tenant), unions
    the `Role.permissions[]` arrays, and denies if any required permission is
    missing. Cached per-process for 60s to keep latency negligible. PLATFORM_ADMIN
    bypasses (intentional — same as the OPA policy would do).
  - Documented in `.env.production.example` that `OPA_ENABLED=false` is the
    current intended state and RBAC IS enforced.

### F2.2 GOOD — RolesGuard correctly checks JWT roles claim
- `services/api/src/common/guards/roles.guard.ts` reads
  `req.user.roles` (set by `JwtAuthGuard` from the verified token), not
  arbitrary claims. No change needed.

### F2.3 GOOD — TenantScopeGuard correctly blocks cross-tenant URLs
- `services/api/src/common/guards/tenant-scope.guard.ts` enforces
  `params.tenantId === req.user.tenantId` with PLATFORM_ADMIN bypass.

### F2.4 MEDIUM — TenantScopeGuard is not applied universally
- **Risk:** Only routes that explicitly `@UseGuards(TenantScopeGuard)` get
  cross-tenant protection. Routes that take `:id` but no `:tenantId` rely on
  service-layer `findFirst({ where: { id, tenantId } })`. This is consistent
  in the code I read but easy to miss in new endpoints.
- **Follow-up:** Add a service-level lint that flags `findFirst/findUnique`
  without a `tenantId` clause on tenant-owned models.

---

## 3. Input Validation

### F3.1 GOOD — Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`
- `services/api/src/main.ts` rejects unknown properties — solid baseline.

### F3.2 MEDIUM — Several DTO fields lacked `@MaxLength`
- **Fix applied:** Added `@MaxLength` caps in `auth.dto.ts` (above).
- **Follow-up:** Sweep `services/api/src/**/dto/*.ts` and add `@MaxLength` to
  every `@IsString` field. (Not done in this pass — out of scope.)

### F3.3 HIGH — Raw SQL string interpolation in `setTenantContext`
- **File:** `services/api/src/prisma/prisma.service.ts`
- **Risk:** Was using `$executeRawUnsafe` with template interpolation, defended
  only by `.replace(/'/g, '')`. A non-quote injection (e.g., `\\` or hex
  literal payloads) could potentially escape.
- **Fix applied:**
  - Switched to **parameterized** `$executeRaw` template literal.
  - Added a defence-in-depth charset allow-list (`^[a-zA-Z0-9_-]{1,64}$`);
    anything else becomes the empty string, which RLS treats as "no tenant"
    (denied).

### F3.4 GOOD — Zero `child_process`, `exec`, or `spawn` usage in API code
- Verified by grep across `services/api/src/`.

### F3.5 GOOD — Zero `$queryRaw`/`$executeRaw` outside of `prisma.service.ts`
- Only `health.controller.ts` runs `SELECT 1` (no user input).

---

## 4. Cryptography

### F4.1 GOOD — Magic links are HMAC-signed (SHA-256), nonce'd, TTL'd,
- `services/api/src/common/utils/magic-link.ts` already uses
  `crypto.timingSafeEqual`. No change.

### F4.2 GOOD — Internal callback secret uses `timingSafeEqual`
- `services/api/src/common/guards/internal-callback.guard.ts`. No change.

### F4.3 LOW — `MAGIC_LINK_SECRET` not documented in `.env.production.example`
- **Fix applied:** Added with a generation hint.

### F4.4 INFO — Magic links carry single-use nonce but are NOT one-shot
- The supplier-portal flow accepts the same token until expiry. That matches
  the documented behaviour (suppliers refresh the page during a session) but
  is worth noting in case the threat model tightens.
- **Follow-up:** Track `consumedAt` on `SupplierInvitation` after first
  `submitResponse`, refuse subsequent submits with the same token.

---

## 5. Secrets Management

### F5.1 GOOD — No live secrets in tree
- Grepped for `sk-[A-Za-z0-9]{20,}` across the repo: 0 matches.
- `.env.production.example` ships with empty placeholders.

### F5.2 GOOD — Logger redacts auth headers + `*.password` / `*.secret`
- `services/api/src/app.module.ts` Pino config:
  `paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.secret']`.

### F5.3 GOOD — No `console.log(env)` or `OPENAI_API_KEY` logging found
- Verified by grep.

### F5.4 LOW — `.env.production.example` did not mandate the JWT_SECRET length
- **Fix applied:** Comment now states the 32-char minimum and the boot-time
  check.

---

## 6. CORS + Headers

### F6.1 CRITICAL — CORS defaulted to `*` and silently accepted it in production
- **File:** `services/api/src/main.ts`
- **Risk:** A blank `CORS_ORIGIN` would expand to `*`, which (combined with
  `credentials: true`) is browser-rejected for credentialed requests but is
  still dangerous and indicates a misconfigured deploy.
- **Fix applied:** Production boot now **throws** if `CORS_ORIGIN` is empty
  or `'*'`. Dev behaviour unchanged.

### F6.2 GOOD — Caddy already sets HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff
- `infra/caddy/Caddyfile`. No change needed there.

### F6.3 MEDIUM — No Content-Security-Policy at the edge
- **Fix applied:** Added a restrictive CSP, COOP, CORP to the Caddyfile
  primary site block. Also added a strict JSON-only CSP via Helmet on the
  API so a leaked HTML response from Nest cannot execute scripts.

---

## 7. Rate Limiting

### F7.1 GOOD — `ThrottlerModule` applied globally (200 req / 60s)
- `services/api/src/app.module.ts`.

### F7.2 HIGH — Login endpoint shared the global throttle (200/min)
- **Fix applied:** `@Throttle({ default: { limit: 5, ttl: 5 * 60_000 } })` on
  `/iam/auth/login`. 30/min on `/iam/auth/refresh`.

### F7.3 MEDIUM — File upload had no dedicated cap
- **Fix applied:** `@Throttle({ limit: 100, ttl: 60_000 })` on
  `/files/upload`.
- **Follow-up:** ThrottlerGuard buckets per IP by default. To enforce
  per-tenant we need a custom `ThrottlerGuard` subclass that uses
  `req.tenantId` as the tracker key. Tagged TODO.

---

## 8. File Upload Security

### F8.1 GOOD — 50 MB limit, mime allow-list, in-memory storage, tenant-scoped S3 path
- `services/api/src/files/files.service.ts` already covered these.

### F8.2 HIGH — Original filename echoed unsanitised into S3 metadata + audit log
- **Risk:** Header injection (CRLF) into S3 metadata; potential XSS if a UI
  ever renders `originalName` raw; download Content-Disposition spoofing.
- **Fix applied:** New `sanitizeFilename()` strips control chars, quotes,
  path separators; caps length at 200. Used at upload + audit + presign.

### F8.3 MEDIUM — Signed download URLs did not force `Content-Disposition: attachment`
- **Risk:** Attacker uploads an HTML / SVG that the browser renders inline
  in the user's session (stored XSS).
- **Fix applied:** `S3Storage.presignGet` now takes an optional
  `downloadFilename` and sets `ResponseContentDisposition: attachment;
  filename="…"`. `FilesService.signedUrl` always passes it.

### F8.4 INFO — No virus scan
- **Follow-up:** ClamAV in a sidecar; queue scan after upload, mark Document
  `status: 'REJECTED'` if positive. Out of scope for this pass.

### F8.5 INFO — Extension also validated, not just mime
- `s3Key` now derives the ext from the **sanitised** filename and rejects
  anything outside `[a-z0-9]{1,8}` (falls back to `bin`). Defence-in-depth
  against `foo.exe;.pdf` style tricks.

---

## 9. Audit Trail Integrity

### F9.1 GOOD — Append-only via Postgres triggers
- `prisma/migrations/01_init/migration.sql`:
  ```sql
  audit_log_immutable() RETURNS trigger AS $$
  BEGIN RAISE EXCEPTION 'audit_log is append-only'; END;
  CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log ...
  CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log ...
  ```
  UPDATE/DELETE are blocked at the database layer.

### F9.2 GOOD — Per-row hash chain + nightly Merkle anchor
- `AuditService.runDailyAnchor` is `@Cron(EVERY_DAY_AT_2AM, { name: 'audit-anchor' })`,
  scheduled via `ScheduleModule.forRoot()` registered in `app.module.ts`.

### F9.3 GOOD — Auditable actions hit `AuditService.log`
- login (success and failure — failure newly added in this pass), invite,
  update, deactivate, role create / assign / revoke, file upload / delete /
  reprocess, supplier invite / create / update / delete / score.
- **Follow-up:** Add an audit entry to report generation (`reports.service.ts`)
  if not already present. Tracking as a TODO.

---

## 10. PII Handling

### F10.1 LOW — Email / phone stored plaintext
- **Fix applied:** None for now — call out clearly in this audit and in the
  customer-facing security doc that field-level encryption is a roadmap
  item. Recommended path: pgcrypto + a per-tenant DEK wrapped by a KMS-held
  CMK; encrypt at insert via Prisma extension, decrypt on read.
- **Follow-up:** PII inventory + DPIA, then pgcrypto rollout.

---

## Summary of files changed

```
services/api/src/iam/iam.service.ts                # auth hardening
services/api/src/iam/iam.controller.ts             # @Throttle + DTOs + logout + mfa stub
services/api/src/iam/dto/auth.dto.ts               # LoginDto, RefreshDto, LogoutDto
services/api/src/common/guards/abac.guard.ts       # RBAC fallback when OPA disabled
services/api/src/common/utils/opa-client.ts        # expose isEnabled()
services/api/src/prisma/prisma.service.ts          # parameterized set_config
services/api/src/files/files.service.ts            # sanitizeFilename, Content-Disposition
services/api/src/files/files.controller.ts         # upload throttle
services/api/src/common/utils/s3.client.ts         # presignGet downloadFilename
services/api/src/main.ts                           # CSP, refuse '*' CORS in prod
services/api/src/common/metrics/*                  # NEW prom metrics module
services/api/src/health/health.controller.ts       # /health/live, /health/ready
services/api/src/app.module.ts                     # wire MetricsModule + interceptor
services/api/package.json                          # +prom-client
infra/caddy/Caddyfile                              # CSP, COOP, CORP
.env.production.example                            # docs + new tunables
SECURITY_AUDIT.md                                  # this file
OBSERVABILITY_AUDIT.md                             # sibling doc
```

## Follow-up backlog (NOT done in this pass)

1. Move refresh-token jti + family registry from in-memory `Map` to Redis.
2. Move account-lockout counters to Redis.
3. Per-tenant ThrottlerGuard subclass (currently per-IP).
4. Virus scan in upload pipeline (ClamAV sidecar).
5. pgcrypto-backed PII encryption for `user.email`, `supplier.contactEmail`,
   phone numbers (after the DPIA).
6. TOTP MFA implementation (only stub today).
7. Service-layer lint: forbid `findFirst/findUnique` on tenant-owned models
   without a `tenantId` clause.
8. Authoring of OPA Rego policies so `OPA_ENABLED=true` can roll out.
9. Sentry / similar error-tracking wiring (see OBSERVABILITY_AUDIT.md §5).
10. Single-use enforcement on supplier-portal magic links.
