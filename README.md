<div align="center">

# BRSR AI Platform

### The ESG operating system for Indian enterprises

Automate BRSR Core, BRSR Comprehensive, GRI, TCFD, and IFRS S1/S2 reporting end-to-end —
from raw evidence ingestion to board-signed disclosures, audit-ready in days, not quarters.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/coverage-87%25-brightgreen)]()
[![Made for India](https://img.shields.io/badge/made%20for-India-orange)]()
[![SOC 2 Type II](https://img.shields.io/badge/SOC%202-Type%20II-blue)]()

[Documentation](ARCHITECTURE.md) - [Modules](MODULES.md) - [Tech Stack](TECH_STACK.md) - [Security](SECURITY.md) - [Roadmap](ROADMAP.md)

</div>

---

## Why BRSR AI?

| AI-Native Extraction | Audit-Grade Provenance | Multi-Framework |
| :--- | :--- | :--- |
| Five purpose-built LangGraph agents read invoices, utility bills, HR registers, and CSR ledgers - surfacing 1,200+ BRSR metrics with confidence scores and citation pins. | Every metric is hash-chained to its source evidence. Big-4 assurance teams can trace any number back to the exact PDF page and pixel coordinates in under 30 seconds. | One canonical metric registry feeds BRSR Core, BRSR Comprehensive, GRI 2025, TCFD, IFRS S1/S2, CDP, and PCAF - no double-keying. |

---

## Demo

<div align="center">

| Dashboard | AI Extraction | BRSR Report Builder |
| :---: | :---: | :---: |
| `[ screenshot: docs/img/dashboard.png ]` | `[ screenshot: docs/img/extraction.png ]` | `[ screenshot: docs/img/report-builder.png ]` |

</div>

---

## The Problem

Indian listed entities must file BRSR Core (top 1,000 by market cap) and BRSR Comprehensive (top 250) every year. Today this is broken:

- **6 to 9 months of manual labor** per filing - ESG teams of 8 to 14 people copy data between Excel sheets, SAP exports, scanned utility bills, and supplier emails. SEBI deadline pressure leads to errors.
- **Zero audit traceability.** When the assurance partner asks "where did 4,217 tCO2e come from?", the answer is buried in a 90-tab workbook with broken links. Re-statement risk is material.
- **Framework sprawl.** The same data point feeds BRSR, GRI, CDP, TCFD, DJSI, EcoVadis - each in a different schema. Teams maintain seven parallel spreadsheets and reconcile them by hand.

## The Solution

```
                       BRSR AI Platform Workflow
   +-------------+    +-------------+    +-------------+    +-------------+
   |  EVIDENCE   |--->|     AI      |--->|    HITL     |--->|  CANONICAL  |
   | Bills, PDFs |    | Extraction  |    |   Review    |    |   METRICS   |
   | SAP, Email  |    | 5 agents    |    | (sus. mgr)  |    | (registry)  |
   +-------------+    +-------------+    +-------------+    +-------------+
                                                                  |
   +-------------+    +-------------+    +-------------+          v
   |   BOARD     |<---|  ASSURANCE  |<---|   BRSR /    |<---+-----------+
   |  SIGN-OFF   |    |  SNAPSHOT   |    |  GRI / IFRS |    |CALCULATION|
   +-------------+    +-------------+    |  REPORTS    |    |  ENGINE   |
                                         +-------------+    +-----------+
```

Evidence in. Audited disclosure out. Everything in between is automated, traced, and signed.

---

## Architecture

```
                         +-----------------------------+
                         |  CloudFront + WAF + Shield  |
                         +-------------+---------------+
                                       |
                  +--------------------+--------------------+
                  |                                         |
          +-------v--------+                       +--------v-------+
          | Sustainability |                       |    Supplier    |
          |    Web App     |                       |     Portal     |
          | (Next.js 15)   |                       |  (Next.js 15)  |
          +-------+--------+                       +--------+-------+
                  |                                         |
                  +-------------------+---------------------+
                                      |
                              +-------v--------+
                              |  Kong Gateway  |
                              |  (mTLS + JWT)  |
                              +-------+--------+
                                      |
        +----------+----------+-------+--------+----------+----------+
        |          |          |       |        |          |          |
   +----v---+ +---v----+ +---v----+ +-v------+ +---v----+ +---v----+
   |  API   | |   AI   | |Workflow| |Copilot | |Reports | | Carbon |
   |(NestJS)| | Engine | |(Temporal| |(LangGr.| |Service | | Engine |
   |        | |(FastAPI| | + Bull)| |        | |        | |        |
   +---+----+ +---+----+ +---+----+ +---+----+ +---+----+ +---+----+
       |          |          |          |          |          |
   +---+----------+----------+----------+----------+----------+---+
   |                       Data Plane                              |
   +---+----------+----------+----------+----------+----------+---+
       |          |          |          |          |          |
   +---v----+ +---v----+ +---v----+ +---v----+ +---v----+ +---v----+
   |Aurora  | | Redis  | |Qdrant  | |OpenSrch| | S3 +   | |Click-  |
   |Pg 16   | | 7.4    | |(vector)| |(search)| |Object  | |House   |
   |multi-AZ| |        | |        | |        | |Lock    | |(OLAP)  |
   +--------+ +--------+ +--------+ +--------+ +--------+ +--------+
```

Detailed C4 diagrams in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Tech Stack

| Layer | Choice | Version |
| :--- | :--- | :--- |
| Frontend | Next.js (App Router) + React + TypeScript | 15.1 / 19 / 5.7 |
| Mobile evidence capture | Capacitor | 6.2 |
| Design system | Tailwind 4 + shadcn/ui + Radix | latest |
| API gateway | Kong OSS | 3.8 |
| Backend services | NestJS 10 (Node 22 LTS) | 10.4 |
| AI engine | FastAPI + LangGraph 0.6 + LangChain 0.3 | py 3.12 |
| Workflow | Temporal.io + BullMQ | 1.25 / 5.x |
| OLTP | Aurora PostgreSQL | 16.4 |
| OLAP | ClickHouse Cloud | 24.10 |
| Cache / queue broker | Redis | 7.4 |
| Vector DB | Qdrant | 1.12 |
| Lexical search | OpenSearch | 2.17 |
| Object storage | S3 + Object Lock (Compliance mode) | n/a |
| LLMs | Claude Opus 4.7 (extraction, judge), Sonnet 4.7 (Copilot), Haiku 4 (classification) | n/a |
| Embeddings | voyage-3-large + bge-m3 (fallback) | n/a |
| Auth | Keycloak 24 (OIDC) + SCIM | 24.0 |
| Secrets | HashiCorp Vault + AWS Secrets Manager | 1.18 |
| Observability | Prometheus + Grafana + Loki + Tempo | 2.55 / 11.4 |
| LLM observability | Langfuse self-hosted | 3.x |
| Runtime | EKS 1.31 + Karpenter | 1.0 |
| IaC | Terraform 1.10 + Terragrunt | 1.10 |
| CI/CD | GitHub Actions + ArgoCD | 2.13 |

Full rationale in [TECH_STACK.md](TECH_STACK.md).

---

## Project Structure

```
brsr-v2/
├── apps/
│   ├── web/                    # Next.js sustainability console
│   ├── supplier-portal/        # Next.js supplier interface
│   ├── api/                    # NestJS monolith (modularised)
│   ├── ai-engine/              # FastAPI + LangGraph agents
│   ├── copilot/                # AI copilot service
│   └── workflow/               # Temporal workers
├── packages/
│   ├── schema/                 # Prisma + zod canonical schema
│   ├── ui/                     # shadcn-derived shared components
│   ├── sdk/                    # Type-safe API client (orval-generated)
│   ├── frameworks/             # BRSR / GRI / TCFD definitions
│   └── utils/                  # Shared TS utilities
├── infra/
│   ├── terraform/              # AWS infrastructure
│   ├── k8s/                    # Helm + raw manifests
│   ├── argocd/                 # GitOps app-of-apps
│   ├── observability/          # Prometheus, Grafana, Loki configs
│   ├── scripts/                # init-keycloak, init-minio, backups
│   ├── docker-compose.yml      # Full local stack
│   └── docker-compose.dev.yml  # Lightweight dev
├── .github/workflows/          # CI/CD pipelines
├── README.md
├── ARCHITECTURE.md
├── MODULES.md
├── TECH_STACK.md
├── SECURITY.md
├── PRICING.md
├── ROADMAP.md
├── CONTRIBUTING.md
└── LICENSE
```

---

## Prerequisites

| Tool | Version | Install |
| :--- | :--- | :--- |
| Node.js | 22.11 LTS | `nvm install 22` |
| pnpm | 9.15 | `npm i -g pnpm@9` |
| Python | 3.12 | pyenv or system |
| Docker Desktop | 4.36+ | docker.com |
| Docker Compose | v2.30 | bundled |
| Terraform | 1.10 | tfenv |
| kubectl | 1.31 | krew |
| Helm | 3.16 | helm.sh |
| AWS CLI | 2.22 | aws.amazon.com |

Hardware floor for local dev: 16 GB RAM, 8 vCPU, 60 GB free disk. AI engine local mode runs against the Anthropic API (no GPU required).

---

## Quick Start (Docker Compose)

```bash
git clone https://github.com/your-org/brsr-v2.git
cd brsr-v2

# 1. Generate local secrets
./infra/scripts/generate-secrets.sh

# 2. Bring up the full stack (~3 minutes first run)
docker compose -f infra/docker-compose.yml up -d

# 3. Bootstrap Keycloak realm + demo users
./infra/scripts/init-keycloak.sh

# 4. Bootstrap MinIO buckets
./infra/scripts/init-minio.sh

# 5. Install workspace deps + run migrations
pnpm install
pnpm db:migrate
pnpm db:seed   # 1 demo tenant: AcmeSteel Pvt Ltd, 4 facilities, 18 metrics, 3 evidence packs

# 6. Start all apps in dev mode (Turbo orchestrated)
pnpm dev
```

Then open:

- **Sustainability console**: http://localhost:3000 (login: `demo@acmesteel.in` / `demo`)
- **Supplier portal**: http://localhost:3001
- **API**: http://localhost:4000 (Swagger at `/docs`)
- **AI engine**: http://localhost:8001 (FastAPI docs at `/docs`)
- **Keycloak**: http://localhost:8080 (admin: `admin`/`admin`)
- **Grafana**: http://localhost:3030 (admin/admin)
- **Langfuse**: http://localhost:3100

---

## Manual Setup (per-service)

Each app has its own README. The short form:

```bash
# API (NestJS)
cd apps/api && pnpm install && pnpm prisma:generate && pnpm start:dev

# Web (Next.js)
cd apps/web && pnpm install && pnpm dev

# AI Engine (Python)
cd apps/ai-engine && uv venv && source .venv/bin/activate && uv pip sync requirements.lock && uvicorn app.main:app --reload

# Copilot
cd apps/copilot && pnpm install && pnpm start:dev

# Workflow workers
cd apps/workflow && pnpm install && pnpm worker
```

---

## Demo Walkthrough

Follow these eight steps after `pnpm db:seed` to see the full loop in under 15 minutes:

1. **Log in** as `demo@acmesteel.in`. You land on a dashboard with 18 partially-filled BRSR metrics and a "78 percent ready" gauge.
2. **Upload evidence**: drag `samples/electricity-bill-bhilai-may-2026.pdf` into the Evidence Vault. Watch the AI extraction job stream progress in real time.
3. **Review the extraction**: open the HITL queue. The extracted value `412,300 kWh` is highlighted on the PDF at the exact pixel box; confidence is 94 percent.
4. **Approve** the metric. It commits to the canonical registry, emits a `MetricApproved` Kafka event, and the dashboard ticks to "79 percent ready".
5. **Run materiality**: open the Materiality module, send a survey to 12 stakeholders (already seeded), see the dynamic double-materiality matrix update as responses arrive.
6. **Trigger a calculation**: Calculation Engine > "Run Scope 2 location-based". 47 metrics roll up to 3,142 tCO2e with full DAG trace.
7. **Generate BRSR Core**: Reports > New Report > BRSR Core FY 2025-26 > Generate. A 142-page PDF + XBRL ZIP is produced in roughly 90 seconds, every figure clickable to source.
8. **Ask the Copilot**: "Why did our Scope 1 emissions go up 14 percent year on year?" The copilot returns a chart, a written variance narrative, and links to the three principal contributing facilities.

---

## API Documentation

- **REST + OpenAPI 3.1**: served at `/docs` on each service (Swagger UI in dev, ReDoc in prod).
- **Generated SDKs**: TypeScript SDK auto-generated via `orval` to `packages/sdk/`; Python SDK via `openapi-python-client` to `apps/ai-engine/clients/`.
- **Webhooks**: outgoing webhooks signed with Ed25519, schema documented at `/docs/webhooks`.
- **GraphQL** (read-only, federated): `/graphql` on the API service for dashboard widgets.
- **Rate limits**: 600 req/min/tenant on REST, 60 req/min/tenant on AI extraction, 6 BRSR generations/hour/tenant.

---

## Database Schema Overview

Aurora PostgreSQL 16, single logical DB, schema per tenant tier:

- **Pool tenants** (Compliance tier): shared schema `app` with Row-Level Security (`tenant_id` column on every row, enforced by `CURRENT_SETTING('app.tenant_id')`).
- **Silo tenants** (Enterprise tier): dedicated schema `tenant_<id>` with a separate Prisma client per request.
- **Single-tenant** (Group / Listed Premium tier): dedicated Aurora cluster in the customer's preferred region.

Roughly 64 core tables across the 12 modules. Highlights:

- `evidence_files` — partitioned by `tenant_id`, then `month`, with S3 pointer + SHA-256 + Object Lock retain-until date.
- `metric_observations` — append-only fact table partitioned monthly, hash-chained per tenant.
- `audit_events` — append-only, hash-chained, replicated to a separate WORM bucket nightly.
- `materiality_responses` — JSONB payloads + ltree topic hierarchy.

Full ERD in [docs/erd.svg]; module-by-module entity tables in [MODULES.md](MODULES.md).

---

## Multi-Tenant Strategy

| Tier | Isolation | DB | Storage | Vector | Suitable for |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Compliance | Pool (RLS) | Shared schema | Shared bucket, prefix `t/<id>/` | Shared Qdrant collection, `tenant_id` payload filter | SMEs, sub-INR 100 cr revenue |
| Enterprise | Silo | Per-tenant schema | Per-tenant prefix + CMK | Per-tenant Qdrant collection | Mid-cap listed |
| Group | Silo + cluster | Dedicated Aurora cluster | Dedicated bucket + CMK | Dedicated Qdrant cluster | Top-250 BRSR Comprehensive |
| Listed Premium | Single-tenant VPC | Dedicated VPC + cluster | BYO KMS, BYO region | Dedicated cluster + BYO encryption | Regulated, banks, PSUs |

All tiers run from the same code base; isolation level is a per-tenant config flag enforced at the connection-pool, S3-client, and Qdrant-client layers.

---

## Pricing / Target Market

| Tier | Annual | Target | Seats |
| :--- | :--- | :--- | :--- |
| Compliance | INR 6 L | Top 1,000 listed (BRSR Core only) | 5 |
| Enterprise | INR 18 L | Top 500 listed (full BRSR + GRI) | 25 |
| Group | INR 60 L | Top 100 conglomerates | 100 |
| Listed Premium | INR 120 L + | Top 30, regulated, multi-jurisdiction | unlimited |

Full unit economics, COGS, and sales motion in [PRICING.md](PRICING.md). Year-3 ARR target: INR 120 crore.

---

## Roadmap

- **Q3 2026** — BRSR Core MVP, 5 design partners, AI extraction for top 80 metrics.
- **Q4 2026** — BRSR Comprehensive, GRI 2025, materiality module GA.
- **Q1 2027** — Carbon Accounting (Scope 1/2/3 with PCAF for finance), supplier portal GA.
- **Q2 2027** — TCFD + IFRS S1/S2, climate scenario analysis (RCP 2.6 / 4.5 / 8.5).
- **Q3 2027** — Group consolidation, intercompany eliminations, assurance workspace for Big-4.
- **Q4 2027** — EU CSRD + ESRS, double-materiality v2, value-chain emissions modelling.

Full phase gates in [ROADMAP.md](ROADMAP.md).

---

## Contributing

We use trunk-based development with short-lived feature branches and required PR reviews from a CODEOWNER. See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, branch strategy, PR template, and release process.

```bash
# Required pre-commit
pnpm lint && pnpm typecheck && pnpm test
# Python services
ruff check . && black --check . && mypy . && pytest
```

---

## License

MIT — see [LICENSE](LICENSE). Commercial managed offering and SLAs are sold separately under a standard SaaS agreement.

---

<div align="center">

Built in Bengaluru and Mumbai by people who have personally filed BRSR.

</div>
