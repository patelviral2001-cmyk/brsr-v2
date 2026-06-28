# BRSR Platform — Debug Handbook

One document, every operational thing you need to debug this platform.

If you're new, read in this order:
1. [Architecture at a glance](#architecture-at-a-glance)
2. [Credentials](#credentials)
3. [Local setup](#local-setup)
4. [Where things live](#where-things-live)
5. [Debugging recipes](#debugging-recipes)
6. [Common failure modes](#common-failure-modes-already-seen-and-fixed)

---

## Architecture at a glance

```
                ┌──────────────┐
                │  Caddy :443  │  ← TLS + reverse proxy (auto Let's Encrypt)
                └──────┬───────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
  ┌────▼─────┐    ┌────▼─────┐     ┌────▼──────┐
  │  web     │    │  api     │     │ ai-engine │
  │  Next.js │    │  NestJS  │     │  FastAPI  │
  │  :3000   │    │  :4000   │     │  :8100    │
  └────┬─────┘    └────┬─────┘     └────┬──────┘
                       │                │
        ┌──────────────┼────────────────┼─────────────┐
        │              │                │             │
   ┌────▼────┐   ┌─────▼─────┐    ┌─────▼─────┐  ┌────▼───┐
   │postgres │   │   redis   │    │  qdrant   │  │ minio  │
   │  :5432  │   │  + bullmq │    │ vectors   │  │   S3   │
   └─────────┘   │   :6379   │    │  :6333    │  │ :9000  │
                 └───────────┘    └───────────┘  └────────┘
```

| Service | Stack | Port | Healthcheck |
|---|---|---|---|
| `brsr-web` | Next.js 15 + React 19 + Tailwind | 3000 | `node http.get(/)` |
| `brsr-api` | NestJS 10 + Prisma 5 + TypeScript | 4000 | `GET /v1/health` |
| `brsr-ai-engine` | FastAPI + OpenAI GPT-5 + pdfplumber + tesseract | 8100 | `GET /health` |
| `brsr-postgres` | PostgreSQL 16 | 5432 | `pg_isready` |
| `brsr-redis` | Redis 7 (BullMQ jobs + cache) | 6379 | `redis-cli ping` |
| `brsr-qdrant` | Qdrant (RAG vectors) | 6333 | HTTP /collections |
| `brsr-minio` | MinIO (S3-compatible object store) | 9000 | minio healthcheck |
| `brsr-caddy` | Caddy 2 reverse proxy | 80/443 | none (long-running) |

## Data flow — upload to BRSR disclosure

```
Customer uploads PDF                          web
        │                                      │
        ▼                                      ▼
   POST /files/upload   ─────────────────►   api  ────────► s3 (minio)
        │                                      │
        │                                      ▼
        │                              files.service.dispatchExtraction()
        │                                      │
        │                                      ▼
        │                          POST /extract ──────► ai-engine
        │                                                    │
        │                                                    ▼
        │                                         Pipeline (6 layers)
        │                                         L1 classify (gpt-5-nano)
        │                                         L2 layout (pdfplumber/ocr)
        │                                         L3 tables
        │                                         L4 rule extractors → LLM fallback
        │                                         L5 mapping
        │                                         L6 validation rules
        │                                                    │
        │           POST /files/extraction-callback ◄────────┘
        │                                      │
        │                                      ▼
        │                      ExtractionField rows persisted (DRAFT)
        │
        ▼
   User reviews → approves
        │
        ▼
   extraction.service.promoteToMetricEvent()
        │
        ▼
   MetricEvent row created, status APPROVED (after Sustainability Manager approve)
        │
        ▼
   GET /brsr/sections ── resolves MetricEvent → BRSR P6-Q6 with evidence chain
        │
        ▼
   Customer sees "purchased_electricity_kwh = 27,232 kWh" on BRSR Principle 6
```

---

## Credentials

```
PRODUCTION (live VPS)
URL:    https://srv1763596.hstgr.cloud
SSH:    ssh -i ~/.ssh/brsr_hostinger root@srv1763596.hstgr.cloud
Repo:   git@github.com:patelviral2001-cmyk/brsr-v2.git

LOGIN
admin@brsr.ai                  / BRSR@Admin#2026     (GROUP_ADMIN — full powers)
demo@imaginepowertree.com      / Demo@1234            (SUSTAINABILITY_MANAGER — view + own writes)

Seeded users (no password — meant for role-mapping examples)
group.admin@imaginepowertree.example     GROUP_ADMIN
sustain.lead@imaginepowertree.example    SUSTAINABILITY_MANAGER
tn.solar.pm@imaginepowertree.example     PLANT_MANAGER
mh.solar.pm@imaginepowertree.example     PLANT_MANAGER
auditor@external-assurance.example       AUDITOR
```

OpenAI key + S3 secret + JWT secret live in the `.env` file at `/home/brsr/brsr-v2/.env` on the VPS. **Rotate OpenAI key periodically** — it was leaked in chat history at one point.

---

## Local setup

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Node 20+ (only if you want to run web/api outside Docker)
- Python 3.11+ (only if you want to run ai-engine outside Docker)
- Git

### Fastest path: full stack via Docker Compose

```bash
git clone https://github.com/patelviral2001-cmyk/brsr-v2.git
cd brsr-v2
cp .env.example .env       # then fill in OPENAI_API_KEY, JWT_SECRET, INTERNAL_CALLBACK_SECRET
docker compose -f docker-compose.prod.yml up -d --build
# wait ~90s for postgres + redis + minio + qdrant to be healthy

# seed canonical metrics + framework mappings + roles + sample hierarchy
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec api node prisma/seed.js

# open http://localhost in browser (Caddy will redirect to https on a self-signed cert)
```

### Per-service local dev (faster iteration)

```bash
# web only — points at production API
cd apps/web
npm install
NEXT_PUBLIC_API_URL=https://srv1763596.hstgr.cloud/api/v1/v1 npm run dev
# http://localhost:3000

# api only — needs Postgres + Redis + MinIO running (use docker for those)
cd services/api
npm install
DATABASE_URL=postgresql://brsr:<pw>@localhost:5432/brsr REDIS_URL=redis://localhost:6379 \
  npm run start:dev
# http://localhost:4000

# ai-engine only — needs Qdrant + Redis
cd services/ai-engine
pip install -r requirements.txt
USE_LAYERED_PIPELINE=true OPENAI_API_KEY=sk-... uvicorn app.main:app --port 8100 --reload
```

---

## Where things live

```
brsr-v2/
├── apps/
│   └── web/                          ← Next.js frontend
│       ├── src/app/(app)/            ← authenticated pages (sidebar nav)
│       │   ├── dashboard/             Executive Dashboard (KPIs + charts)
│       │   ├── hierarchy/             Company structure
│       │   ├── files/                 Upload + browse documents
│       │   ├── files/[id]/            File detail w/ extracted fields + Download
│       │   ├── extraction-review/     Review queue for low-confidence fields
│       │   ├── metrics/               Canonical metric registry + events
│       │   ├── frameworks/[framework]/ BRSR / GRI / TCFD detail
│       │   ├── calculations/          CalcRun history
│       │   ├── carbon/                Scope 1/2/3, net-zero, MACC, abatement, credits
│       │   ├── reports/generate/      6-step wizard for report generation
│       │   ├── materiality/           Materiality matrix + stakeholder map
│       │   ├── suppliers/             Supplier portal + responses
│       │   ├── assurance/             Snapshot management
│       │   ├── audit-log/             Append-only activity log
│       │   ├── copilot/               LLM chat over tenant data
│       │   └── settings/              Org / users / integrations
│       ├── src/components/            shared UI (page-header, kpi-card, charts...)
│       ├── src/lib/api/               apiClient + endpoints + query hooks
│       └── src/lib/utils.ts            userLabel / shortId / initials / cn
│
├── services/
│   ├── api/                          ← NestJS backend
│   │   ├── src/
│   │   │   ├── app.module.ts          wires every feature module
│   │   │   ├── iam/                   auth (HS256 JWT) + users + roles
│   │   │   ├── tenants/               tenant CRUD
│   │   │   ├── hierarchy/             EntityNode tree
│   │   │   ├── files/                 upload + extraction-callback + download stream
│   │   │   ├── extraction/            review queue + approve → promoteToMetricEvent
│   │   │   ├── metrics/               canonical registry + metric events
│   │   │   ├── calculations/          formulas + CEL evaluator + CalcRun
│   │   │   ├── carbon/                emissions overview + SBTi + abatement
│   │   │   ├── dashboard/             KPIs + activity + anomalies (NEW)
│   │   │   ├── brsr/                  /brsr/sections + /resolve + /preview + /generate
│   │   │   ├── reports/               PDF / XLSX / XBRL workers
│   │   │   ├── assurance/             snapshots + exceptions
│   │   │   ├── materiality/           topics + stakeholders + surveys
│   │   │   ├── suppliers/             supplier scorecards
│   │   │   ├── audit/                 append-only audit_log
│   │   │   ├── copilot/               LLM chat router
│   │   │   ├── common/                guards (auth/abac/tenant-throttler), pipes, decorators
│   │   │   └── prisma/                PrismaService (global)
│   │   ├── prisma/schema.prisma       single source of truth for the DB model
│   │   └── prisma/seed.ts             initial canonical metrics + framework mappings
│   │
│   └── ai-engine/                    ← FastAPI extraction pipeline
│       ├── app/
│       │   ├── main.py                FastAPI app + routes
│       │   ├── router/extract.py      POST /extract + POST /classify
│       │   ├── orchestrator/
│       │   │   └── document_orchestrator.py  legacy path + delegates to layered
│       │   ├── pipeline/
│       │   │   ├── orchestrator.py    6-layer entry point
│       │   │   ├── layer1_classifier.py
│       │   │   ├── layer2_layout.py    pdfplumber / OCR
│       │   │   ├── layer3_tables.py
│       │   │   ├── layer4_vision_extractor.py  rule extractors + LLM fallback
│       │   │   ├── layer5_mapping.py
│       │   │   └── layer6_validation.py
│       │   ├── extractors/
│       │   │   ├── electricity_discom.py  31 Indian DISCOMs (MSEDCL incl.)
│       │   │   ├── water_bill.py          multi-source water
│       │   │   ├── waste_manifest.py      hazardous + category waste
│       │   │   └── hr_headcount.py        employee counts
│       │   ├── llm/router.py           gpt-5 family param adapter
│       │   ├── confidence/composite_scorer.py
│       │   ├── validation/rules_engine.py  40 rules
│       │   └── registry.py             canonical metric definitions
│       └── tests/benchmark/           115-fixture regression suite
│           └── runner.py               run via `python -m tests.benchmark.runner`
│
├── infra/
│   └── caddy/Caddyfile                production reverse proxy + TLS
│
├── docker-compose.prod.yml            full production stack
└── DEBUG.md                           ← you are here
```

---

## Debugging recipes

### "The site is down"

```bash
ssh -i ~/.ssh/brsr_hostinger root@srv1763596.hstgr.cloud
docker ps --format '{{.Names}}: {{.Status}}'         # which container is unhealthy?
curl -sk https://srv1763596.hstgr.cloud/health        # what does the health endpoint say?
docker logs --tail 100 brsr-api                      # API logs
docker logs --tail 100 brsr-web                      # web logs
docker logs --tail 100 brsr-ai-engine                # extraction logs
docker compose -f /home/brsr/brsr-v2/docker-compose.prod.yml restart api  # restart one service
```

### "Upload succeeds but no fields extracted"

```bash
# 1. Find the doc id from the API response, then trace
DOC=cmqkp249u001oui1i7f5laesz   # the file you uploaded

# 2. AI engine logs for that doc
docker logs --since 5m brsr-ai-engine | grep -E "$DOC|layer4|llm.call|rule_extractor|callback"

# Expected for an MSEDCL bill:
#   llm.call task=classify model=gpt-5-nano   ← classifier runs ($0.0002)
#   layer4.rule_extractor_fired discom=MSEDCL confidence=0.96
#   layer4.llm_skipped reason=rule_extractor_complete   ← Layer 4 LLM bypassed
#   pipeline.completed fields=1
#   callback.delivered status=201

# 3. DB rows
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "SELECT canonical_key, value_num, unit_extracted, period_start::date, status FROM extraction_field WHERE document_id='$DOC';"

# 4. Document status
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "SELECT status, classifier_confidence FROM document WHERE id='$DOC';"
```

### "BRSR P6-Q6 still shows UNANSWERED after I approved an extraction"

```bash
# 1. Check the extraction was approved
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "SELECT id, canonical_key, value_num, status FROM extraction_field WHERE document_id='$DOC';"
# Expect: status='APPROVED'

# 2. Was a metric_event auto-created?
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "SELECT id, canonical_key, value, status, source_extraction_id FROM metric_event WHERE source_extraction_id IN (SELECT id FROM extraction_field WHERE document_id='$DOC');"
# Expect: status='DRAFT' (must be submitted+approved to APPROVED for BRSR to pick it up)
# If empty: check API logs around the approve call:
docker logs --since 10m brsr-api | grep promoteToMetricEvent

# 3. Approve the metric_event to APPROVED for BRSR to see it
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "UPDATE metric_event SET status='APPROVED' WHERE source_extraction_id IN (SELECT id FROM extraction_field WHERE document_id='$DOC');"

# 4. Verify BRSR resolve picks it up
JWT=$(curl -sk -X POST https://srv1763596.hstgr.cloud/api/v1/v1/iam/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@brsr.ai","password":"BRSR@Admin#2026"}' | jq -r .data.token)
curl -sk "https://srv1763596.hstgr.cloud/api/v1/v1/brsr/sections?fy=FY24-25&framework=BRSR" \
  -H "Authorization: Bearer $JWT" | grep -oE 'P6-Q6[^}]+}'
```

### "Login is failing"

```bash
# 1. API health
curl -sk https://srv1763596.hstgr.cloud/health

# 2. Try login directly against API
curl -sk -X POST https://srv1763596.hstgr.cloud/api/v1/v1/iam/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@brsr.ai","password":"BRSR@Admin#2026"}'

# 3. Check user exists + has a password hash
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "SELECT email, is_active, LEFT(password_hash,12) AS hp FROM \"user\" WHERE email='admin@brsr.ai';"

# 4. Bcrypt verify
docker exec brsr-api node -e "const b=require('bcrypt'); console.log(b.compareSync('BRSR@Admin#2026','<paste hash here>'))"

# 5. JWT secret consistency (both api + ai-engine must share INTERNAL_CALLBACK_SECRET)
docker exec brsr-api printenv JWT_SECRET INTERNAL_CALLBACK_SECRET
docker exec brsr-ai-engine printenv BACKEND_CALLBACK_SECRET
```

### "The Original download returns 401 or fails silently"

```bash
# The download endpoint streams via the API (NOT via a presigned MinIO URL).
# Test it directly:
JWT=...
curl -sk -o /tmp/x.pdf -w 'HTTP %{http_code} | %{content_type} | %{size_download} bytes\n' \
  "https://srv1763596.hstgr.cloud/api/v1/v1/files/$DOC/download" \
  -H "Authorization: Bearer $JWT"
file /tmp/x.pdf
```

### "Dashboard KPIs all show 0"

The dashboard reads `metric_event` rows for the FY of the most recent APPROVED event.

```bash
# 1. Are there any APPROVED metric_events?
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "SELECT canonical_key, value, status, period_start::date, period_end::date FROM metric_event WHERE tenant_id='cmqhxlufj0000o01b8is3avj0' ORDER BY period_end DESC LIMIT 5;"

# 2. The dashboard service picks the FY containing the most recent APPROVED event.
#    If there's nothing APPROVED, it returns zeros.

# 3. Force-approve recent events for testing:
docker exec brsr-postgres psql -U brsr -d brsr -c \
  "UPDATE metric_event SET status='APPROVED' WHERE status='DRAFT' AND tenant_id='cmqhxlufj0000o01b8is3avj0';"
```

### "I changed code locally but the deployed version isn't updating"

```bash
# Web/api/ai-engine each run in a docker image baked from source.
# Edit local source → scp → rebuild image → restart container

scp -i ~/.ssh/brsr_hostinger -p apps/web/src/lib/utils.ts \
  root@srv1763596.hstgr.cloud:/home/brsr/brsr-v2/apps/web/src/lib/utils.ts

ssh -i ~/.ssh/brsr_hostinger root@srv1763596.hstgr.cloud
cd /home/brsr/brsr-v2
docker compose -f docker-compose.prod.yml build web      # or api / ai-engine
docker compose -f docker-compose.prod.yml up -d web      # restart that container
sleep 18
docker ps --format '{{.Names}}: {{.Status}}'             # verify healthy
```

For permanent changes, commit + push to GitHub main first.

---

## Common failure modes (already seen and fixed)

| Symptom | Root cause | Fix (already shipped) |
|---|---|---|
| `/iam/me` returns `passwordHash` field | Prisma findUnique returns all columns | `iam.service.me()` strips `passwordHash` + `mfaSecret` |
| Upload returns 201 but doc is REJECTED | API → AI engine contract drift (`callback_secret` field forbidden by Pydantic `extra="forbid"`) | Removed field from dispatch + URL fix to `/api/v1/v1/files/extraction-callback` |
| AI engine callback returns 400 | AI engine was sending raw `ExtractResponse` shape; API expected camelCase `documentId/tenantId/fields` | `to_backend_callback_payload()` maps to backend DTO |
| brsr-web unhealthy 537× | Healthcheck `wget --spider localhost:3000` followed 307 to public URL it couldn't reach | Node-based healthcheck that doesn't follow redirects |
| gpt-5 calls fail with HTTP 400 | gpt-5 family rejects `max_tokens` + `temperature=0` + bare `json_object` | `llm.router._raw_call` switches to `max_completion_tokens`, omits temperature, ensures word "json" in prompt |
| Metrics page crashes "Cannot read of undefined (reading 'slice')" | `framework-badges.tsx` called `frameworks.slice(0,max)` without null guard | Defensive `Array.isArray(frameworks) ? ... : []` |
| Frameworks/BRSR page empty | Frontend hit `GET /brsr/preview` but backend was `POST /brsr/preview` (method mismatch → 404) | New `GET /brsr/sections` endpoint that auto-defaults scope to all root entities and returns frontend-shaped data |
| Sidebar "Extraction Review 12" but page says 0 | Sidebar badge hardcoded; page filter excluded high-confidence DRAFT rows | Removed hardcoded badge + queue filter includes DRAFT |
| Dashboard KPIs all show 0 | Dashboard endpoints (`/dashboard/kpis`, `/activity`, `/anomalies`) returned 404 | New `DashboardModule` with real rollups + FY auto-selection |
| File detail "uploaded by cmqhxlui..." | Page read `file.uploadedBy` directly (raw user id) | Resolve via `useUsers()` + `userLabel(id, users)` helper |
| Audit log crash "RangeError: Invalid time value" | Page used `formatRelative(ev.at)` but API returns `createdAt` | Normalize shape + harden `formatRelative` against null/undefined/Invalid Date |
| Original download fails — MinIO unreachable | Presigned URL signed with internal docker hostname `minio:9000` | New `GET /files/:id/download` streams bytes via the API |
| MSEDCL Marathi bills not extracted | Classifier said `doc_type=UNKNOWN`; rule extractor gate excluded UNKNOWN | Gate now includes UNKNOWN + OTHER + Marathi patterns added |

---

## Running tests + benchmarks

```bash
# AI engine 115-fixture regression
docker compose -f docker-compose.prod.yml exec ai-engine \
  python -m tests.benchmark.runner

# Web Playwright walkthrough
cd qa-ui-test
node walkthrough.js                       # all 30+ pages, screenshots in shots-walk/
node audit-end-to-end.js                  # full admin + demo journey
node deep-scan.js                         # hunt for raw cuids / NaN / undefined

# API type-check (no compile)
cd services/api && npx tsc --noEmit
# Web type-check
cd apps/web && npx tsc --noEmit
```

---

## Build artifacts to ignore when bundling

```
node_modules/
.next/
dist/
__pycache__/
.pytest_cache/
.venv/
qa-ui-test/shots*/         # screenshots from runs
qa-ui-test/*.json          # reports
.env                       # secrets
```

---

## Contacts + escalation

- **Repo:** https://github.com/patelviral2001-cmyk/brsr-v2
- **Production:** https://srv1763596.hstgr.cloud
- **Hosting:** Hostinger VPS (KVM4), Ubuntu, ~/.ssh/brsr_hostinger key
- **OpenAI billing:** customer-owned key in `.env` — rotate if exposed
- **Customer demo:** ₹50L/year tier; see `PRICING.md` for tier breakdown

---

## Reading order for new engineers

1. **This file** (you're here).
2. `services/api/prisma/schema.prisma` — the data model is the contract.
3. `services/api/src/files/files.service.ts` — upload → dispatch → callback flow.
4. `services/ai-engine/app/pipeline/orchestrator.py` — the 6-layer extraction.
5. `services/ai-engine/app/extractors/electricity_discom.py` — rule-based DISCOM matching (the cost-killer).
6. `apps/web/src/app/(app)/files/[id]/page.tsx` — how a customer reviews extractions.
7. `services/api/src/brsr/brsr.service.ts` — how a metric_event becomes a BRSR disclosure.
8. `services/api/src/extraction/extraction.service.ts:promoteToMetricEvent` — the auto-promotion that ties extraction → metric → disclosure.

After those seven files, you understand the whole platform.
