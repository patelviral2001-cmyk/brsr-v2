# brsr-api — NestJS backend

The single source of truth for tenants, users, files, extractions, metrics,
calculations, BRSR resolutions, reports, audit.

## Stack
- NestJS 10 (Express)
- Prisma 5.22 (Postgres)
- BullMQ (Redis) for calc + report jobs
- HS256 JWT auth (no Keycloak in current deploy)
- HTTP versioning: global prefix `/api/v1` + URI version `v1` → final paths `/api/v1/v1/...`
- Pino logger
- Throttler (per-tenant since v2.1)

## Run

```bash
cd services/api
npm install
DATABASE_URL=postgresql://brsr:<pw>@localhost:5432/brsr \
REDIS_URL=redis://localhost:6379 \
S3_ENDPOINT=http://localhost:9000 \
S3_ACCESS_KEY=brsr-admin S3_SECRET_KEY=<minio_pw> \
JWT_SECRET=<32-char-secret> \
INTERNAL_CALLBACK_SECRET=<32-char-secret> \
AI_ENGINE_URL=http://localhost:8100 \
npm run start:dev
# http://localhost:4000
```

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/iam/auth/login` | username/password → JWT |
| GET | `/iam/me` | current user profile (no credential leak) |
| GET | `/iam/users` | list users (admin only) |
| GET | `/hierarchy/tree` | entity-node tree |
| POST | `/files/upload` | multipart upload → dispatches to AI engine |
| GET | `/files` | list with status filter + pagination |
| GET | `/files/:id` | detail (no signed URL — fetch on demand) |
| GET | `/files/:id/download` | **streams** the original via API (auth) |
| POST | `/files/:id/reprocess` | re-run extraction |
| POST | `/files/extraction-callback` | **internal**: AI engine posts here (HMAC-protected) |
| GET | `/extraction/queue` | review queue (DRAFT + NEEDS_REVIEW) |
| POST | `/extraction/fields/:id/approve` | approve → auto-promote to MetricEvent |
| POST | `/metrics/events` | manual metric submission |
| POST | `/metrics/events/:id/approve` | approve (with segregation-of-duties) |
| POST | `/calculations/scope1` (or scope2/scope3-category) | trigger calc run |
| GET | `/calculations/runs` | run history |
| GET | `/carbon/emissions` | overview (no params → current FY rollup) |
| GET | `/dashboard/kpis` | ESG score, emissions, intensity, completeness |
| GET | `/dashboard/activity` | recent audit log |
| GET | `/dashboard/anomalies` | low-confidence metrics |
| POST | `/brsr/resolve` | full resolved sections (auth-scoped) |
| GET | `/brsr/sections?fy=&framework=` | frontend-shaped principle tree |
| POST | `/brsr/preview` | rendered HTML preview |
| POST | `/brsr/generate` | enqueue PDF/XLSX report generation |
| GET | `/reports` | list reports |
| GET | `/audit/logs` | append-only audit log |

## Module layout

```
src/
├── app.module.ts              wires every feature module
├── main.ts                    bootstrap, global pipes, CORS, helmet, swagger
├── prisma/                    PrismaService (@Global)
├── common/
│   ├── decorators/            @CurrentUser, @Public, @RequirePermissions, @Audit
│   ├── guards/                JwtAuthGuard, AbacGuard, TenantThrottlerGuard, InternalCallbackGuard
│   ├── interceptors/          TenantInterceptor, AuditInterceptor
│   ├── pipes/                 ParseCuidPipe
│   └── utils/s3.client.ts     thin S3 wrapper (presign + stream)
├── iam/                       auth + users + roles + permissions
├── tenants/                   tenant CRUD
├── hierarchy/                 EntityNode tree
├── files/                     upload + extraction-callback + download stream
├── extraction/                review queue + approve + promoteToMetricEvent
├── metrics/                   canonical registry + metric_event lifecycle
├── calculations/              CEL formulas + CalcRun worker
├── dashboard/                 KPIs (new in v2.1)
├── carbon/                    emissions overview + SBTi + abatement + credits
├── brsr/                      resolve + sections + preview + generate
├── reports/                   PDF/XLSX/XBRL workers
├── assurance/                 snapshots + exceptions
├── materiality/               topics + stakeholders + surveys
├── suppliers/                 scorecards + portal
├── audit/                     audit_log + walkthrough
└── copilot/                   LLM chat router
```

## Database

```bash
# generate Prisma client
npx prisma generate

# apply migrations
npx prisma migrate deploy

# seed canonical metrics + framework mappings + roles + sample hierarchy
node prisma/seed.js

# open Prisma Studio
npx prisma studio
```

Schema highlights:
- `tenant` → one customer org
- `entity_node` → company hierarchy (group → entity → BU → site)
- `user` + `role` + `role_assignment` → RBAC scoped by entity_node
- `document` → uploaded file + status enum (`PENDING`, `CLASSIFIED`, `EXTRACTED`, `REVIEW_NEEDED`, `APPROVED`, `REJECTED`)
- `extraction_field` → AI engine's output per metric_key (one row per field)
- `metric_event` → APPROVED disclosure value (source_extraction_id links back to extraction)
- `calc_run` → formula execution log
- `framework_mapping` → which canonical_keys feed which BRSR/GRI/TCFD section
- `canonical_metric` → registry of every metric we support
- `emission_factor` → DEFRA/CEA/IPCC factors
- `audit_log` → append-only, partitioned by month

## Testing

```bash
npm run test               # jest unit tests
npm run test:e2e            # end-to-end against running services
npm run lint
npm run typecheck            # tsc --noEmit
```

## Debugging

See `../../DEBUG.md` for end-to-end recipes. Service-specific:

```bash
# Tail logs
docker logs -f brsr-api

# Inspect a request
docker logs brsr-api | grep <request-id>     # logged on every request as `requestId`

# Inspect a tenant's metric_events
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "SELECT canonical_key, value, status, period_end::date FROM metric_event WHERE tenant_id='<t>' ORDER BY created_at DESC LIMIT 20;"

# Test an endpoint
JWT=$(curl -sk -X POST http://localhost:4000/api/v1/v1/iam/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@brsr.ai","password":"BRSR@Admin#2026"}' | jq -r .data.token)
curl -sk http://localhost:4000/api/v1/v1/dashboard/kpis -H "Authorization: Bearer $JWT" | jq
```
