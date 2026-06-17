# BRSR AI Platform — Tech Stack

Opinionated, single-pane-of-glass view of every technology used, why it was chosen, what was considered, and the licensing / cost implications. Reviewed semi-annually; next review 2026-12.

Notation: "Cost" is order-of-magnitude monthly run rate at the platform's projected scale of 100 paid tenants and 10,000 monthly evidence files / tenant. "License" is the relevant OSS license or "Commercial" with billing model.

---

## Frontend

| Tech | Version | Why | Alternatives considered | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Next.js (App Router) | 15.1 | RSC + Server Actions kill the API boilerplate for read-mostly screens; streaming SSR for fast TTFB; Vercel-class DX without vendor lock-in | Remix (smaller team, smaller ecosystem); SvelteKit (mismatch with shadcn) | MIT / hosted on EKS, no licence fee |
| React | 19 | Server Components, async transitions, Suspense at scale | Vue 3 (team expertise lower); Solid (small ecosystem) | MIT |
| TypeScript | 5.7 | Required for a system this size | Flow (deprecated effectively) | Apache 2 |
| Tailwind CSS | 4.0 | Utility-first speeds the team; CSS-in-JS is a perf trap at our scale | CSS Modules (slower iteration); Vanilla Extract (immature) | MIT |
| shadcn/ui (copy-in) | latest | Owned components, Radix-based a11y, no runtime lib | MUI (heavy, opinionated theme); Chakra (slow shipping) | MIT |
| Radix Primitives | 1.2 | Accessibility done right | Headless UI (less complete) | MIT |
| Tanstack Query | 5.62 | Caching + suspense for client interactions | SWR (less powerful); RTK Query (too much Redux) | MIT |
| Zustand | 5.0 | Tiny client state, no Redux ceremony | Jotai (more granular but harder reasoning); Redux Toolkit (overkill) | MIT |
| react-hook-form + zod | 7.54 / 3.24 | Schema-first forms; same zod schemas server-side | Formik (slower); Yup (less ergonomic types) | MIT |
| Tanstack Table | 8.21 | Headless tables; we own the styling; virtualised | AG Grid (commercial, $$$) | MIT |
| React Flow | 12 | DAG visualiser for Calculation Engine | DagreD3 (lower-level) | MIT |
| Recharts + visx | 2.15 / 3.12 | Recharts for product, visx for exec dashboards | Highcharts (commercial, expensive); D3 raw (slower dev) | MIT |
| MDX | 3.1 | BRSR templates authored as MDX | Markdown + custom DSL (more work) | MIT |
| next-intl | 3.26 | Multi-locale (Hindi, English, Tamil planned) | i18next (less Next-native) | MIT |
| Mapbox GL JS | 3.8 | Facility map | MapLibre (great fallback, planned for Q3) | Commercial (free tier covers us at < 50k MAU) |
| Capacitor | 6.2 | Mobile evidence capture (plant managers) | React Native (heavier; we don't need native UI) | MIT |

---

## Backend Services

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Node.js | 22.11 LTS | Stable LTS, native ESM, fetch | 20 LTS (older); Bun (immature for prod) | MIT |
| NestJS | 10.4 | Modular, opinionated, scales to 12 modules cleanly | Fastify raw (less structure); Hapi (smaller community); Express (too unstructured) | MIT |
| Prisma | 6.0 | Type-safe DB layer; introspection is solid; multi-schema support | Drizzle (less mature client; better SQL transparency, will reassess); Kysely (too low-level) | Apache 2 |
| Zod | 3.24 | Validation that doubles as types | Yup (no type inference); io-ts (steep learning curve) | MIT |
| Pino | 9.5 | Fast structured logging | Winston (slower); Bunyan (stale) | MIT |
| CASL | 6.7 | RBAC + ABAC abilities in one place | Casbin (less ergonomic TS); custom (avoid) | MIT |
| Bull MQ | 5.34 | Redis-backed jobs with delays, retries, priorities | Agenda (mongo-tied); RabbitMQ (heavier ops) | MIT |
| Temporal.io | 1.25 | Durable execution for multi-step workflows (assurance freezes, report generation) | AWS Step Functions (vendor lock-in); home-grown saga (no thanks) | MIT (Cloud OSS) |
| FastAPI | 0.115 | Best Python web framework; pydantic v2 native | Litestar (smaller community); Flask (manual everything) | MIT |
| LangGraph | 0.6 | First-class state machines for agents | Custom (we tried, painful); CrewAI (less control) | MIT |
| LangChain | 0.3 | Tool definitions, prompt templates, output parsers | LlamaIndex (overlaps); raw API (boilerplate) | MIT |
| Pydantic | 2.10 | Schema validation, faster than v1 | dataclasses (no validation); attrs (less LLM ecosystem) | MIT |
| uvicorn + gunicorn | 0.32 / 23 | Production ASGI | Hypercorn (smaller community) | BSD-3 / MIT |
| Uv | 0.5 | Fast Python package manager + venv | Poetry (slower); pip-tools (no venv) | Apache 2 |
| Ruff | 0.8 | Lint + format in one fast tool | Black + flake8 + isort (slower, three tools) | MIT |
| pytest | 8.3 | Standard | unittest (less ergonomic) | MIT |
| mypy | 1.13 | Static types | pyre (Meta-focused); pyright (great too, lower CI throughput) | MIT |

---

## API Gateway and Mesh

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Kong Gateway OSS | 3.8 | Plugins for JWT, rate-limit, mTLS, audit; widely deployed; declarative config | AWS API Gateway (vendor lock, hard custom plugins); Tyk OSS (smaller ecosystem); Envoy raw (configuration burden) | Apache 2 / EKS hosted |
| Linkerd | 2.16 | Ultralight mesh, automatic mTLS, fastest mesh I/O | Istio (too heavyweight); Cilium service mesh (great but newer) | Apache 2 |
| Cilium | 1.16 | eBPF network policy + observability | Calico (acceptable; less eBPF) | Apache 2 |

---

## Database

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Aurora PostgreSQL | 16.4 | Logical replication, RLS, multi-AZ, fast clone for staging | RDS Postgres (less elastic storage); Citus (sharding overkill at our scale); Yugabyte (immature ops) | Commercial / ~$2,500/mo (r6g.xlarge writer + 2 readers) |
| pgvector | 0.8 | Embedded vectors for small per-tenant indexes (Pool tier) | (Qdrant covers most needs) | PostgreSQL License |
| pg_partman | 5.2 | Automated partition maintenance | manual cron (error-prone) | PostgreSQL License |
| PgBouncer | 1.23 | Connection pooling | RDS Proxy (vendor; we want portability) | BSD-like |
| Liquibase + Prisma Migrate | 4.30 / 6.0 | Prisma for schema; Liquibase for cross-db operational (rollouts of indexes) | Just Prisma (sometimes constraining); Flyway (less Postgres-fluent) | Apache 2 + Apache 2 |

---

## Search and Vector

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Qdrant | 1.12 | Fast, well-documented, payload filters are excellent for tenant scoping | Pinecone (vendor lock, pricier); Weaviate (heavier, GraphQL overhead); Milvus (operational complexity) | Apache 2 / self-hosted on EKS |
| OpenSearch | 2.17 | Lexical search + audit log search; fork of Elasticsearch | Elasticsearch (licensing risk); MeiliSearch (limited at our query complexity) | Apache 2 |
| voyage-3-large embeddings | 2026 | Highest-quality general embeddings; long context | OpenAI text-embedding-3-large (acceptable; we prefer non-OpenAI for sovereignty); Cohere (good but pricier) | Commercial usage-based / ~$0.06 per 1M tokens |
| BAAI/bge-reranker-v2-m3 | 2024-11 | Excellent cross-encoder reranker, CPU friendly | Cohere rerank (commercial); ms-marco-MiniLM (lower quality) | MIT |
| bge-m3 (fallback) | 2024-06 | Self-hostable embedding when sovereignty demands | nomic-embed-text (good open option) | MIT |

---

## Queue and Cache

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Redis (ElastiCache) | 7.4 | Cache + idempotency keys + Bull MQ broker + sessions | Memcached (no streams); KeyDB (smaller community) | BSD-3 / Commercial cluster ~$400/mo |
| Amazon MSK | 3.7 (Kafka 3.7) | Domain events backbone | RabbitMQ (less durable); Kinesis (vendor lock); Redpanda (newer, smaller ecosystem) | Commercial / ~$700/mo at 3-broker minimum |
| Debezium | 2.7 | CDC from Postgres to Kafka for ClickHouse mirror | Maxwell (Postgres support weaker) | Apache 2 |

---

## AI Models

| Model | Use | Cost target | Notes |
| :--- | :--- | :--- | :--- |
| claude-opus-4-7 | Extraction, judge, anomaly explanation | < INR 18 / extraction | Highest-quality reasoning; we cache prompts aggressively for the agent supervisor |
| claude-sonnet-4-7 | Copilot, narrative drafting, benchmark commentary | < INR 0.5 / chat turn | Streaming responses; prompt caching for the system prompt + tenant context |
| claude-haiku-4 | Page classification, simple routing | < INR 0.02 / page | Used as the cheap first-pass classifier |
| Voyage voyage-3-large | Production embeddings | $0.06 / 1M tokens | Periodic re-embed on prompt-version bumps |
| bge-m3 (self-hosted, fallback) | Sovereignty / air-gapped | Compute only | Two-GPU inference server per region |
| BAAI/bge-reranker-v2-m3 | Reranking RAG results | Compute only | CPU sufficient |

---

## Object Storage

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Amazon S3 | n/a | Standard; cross-region replication; Object Lock; CRC validation | GCS (we are AWS-anchored); MinIO (great for local; in prod we want managed) | Commercial / ~$0.024/GB at S3 Standard, $0.01 at Standard-IA |
| S3 Object Lock (Compliance mode) | n/a | WORM for evidence-vault — auditors require it | DocLock (vendor); home-grown (no certs) | Bundled |
| MinIO | 2024-12-13 | Local dev S3 | LocalStack (heavier startup) | AGPL v3 (we don't ship MinIO; local dev only) |

---

## Auth and Identity

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Keycloak | 24.0 | OSS OIDC + SAML + SCIM + flexible federation | Auth0 (per-MAU pricing painful at our scale); WorkOS (SAML-focused, more expensive than self-hosting); Authentik (smaller community) | Apache 2 / EKS hosted |
| HashiCorp Vault | 1.18 | Secrets, dynamic credentials, Transit engine for field encryption | AWS Secrets Manager alone (no Transit, no dynamic DB creds at our scale) | MPL 2 / hosted on EKS |
| AWS KMS | n/a | CMKs for data encryption; BYOK pattern | GCP KMS (we are AWS); CloudHSM (only for highest tier customers) | Commercial / ~$1 per CMK per month + usage |
| DocuSign eSign | n/a | Board sign-offs, partner signatures | Adobe Sign (similar); Zoho Sign (cheaper but legal acceptance weaker in India) | Commercial / ~$40 per user per month |

---

## Observability

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Prometheus | 2.55 | Standard metrics | VictoriaMetrics (better at very high scale; revisit at 10M series) | Apache 2 |
| Grafana | 11.4 | Dashboards | Kibana (tied to ES); Datadog (commercial, $$$) | AGPL v3 (self-hosted; we don't redistribute) |
| Loki | 3.3 | Log aggregation; cheap object storage backend | Elastic (heavyweight); CloudWatch (vendor lock, $$$) | AGPL v3 |
| Tempo | 2.6 | Distributed tracing | Jaeger (great too; Tempo cheaper at scale) | AGPL v3 |
| OpenTelemetry | 1.30 | Standardised instrumentation | Vendor SDKs (lock-in) | Apache 2 |
| Langfuse (self-host) | 3.x | LLM-specific traces: prompt + completion + cost + score; integrates with our IdP | LangSmith (vendor; data sovereignty risk); Arize Phoenix (smaller LLM-trace coverage) | MIT (OSS edition) |
| Sentry (self-host) | 24.x | Frontend error tracking | LogRocket (no self-host); Bugsnag (per-event pricing) | BSL 1.1 (self-host OK for our use) |
| PagerDuty | n/a | On-call, escalation | OpsGenie (acquired by Atlassian, future uncertain); Grafana OnCall (newer) | Commercial / ~$25/user/month |

---

## DevOps and Runtime

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| Amazon EKS | 1.31 | Managed control plane; AWS-native networking | GKE (we are AWS); self-managed kubeadm (ops burden) | Commercial / $73 per cluster per month + nodes |
| Karpenter | 1.0 | Faster scaling than CAS; bin-packing | Cluster Autoscaler (slower) | Apache 2 |
| Helm | 3.16 | Chart packaging | Kustomize alone (less ergonomic for complex charts); Pulumi K8s (overkill) | Apache 2 |
| Argo CD | 2.13 | GitOps with app-of-apps | Flux (great too; ArgoCD has better UI for our ops team) | Apache 2 |
| Terraform | 1.10 | IaC standard | Pulumi (TS-native, nice but team knows TF); CloudFormation (AWS lock-in) | BSL 1.1 (acceptable for ours, but we monitor) |
| Terragrunt | 0.69 | DRY across environments | Terraspace (smaller community); Terraform Workspaces (less DRY) | MIT |
| Cilium | 1.16 | CNI + eBPF NetworkPolicy | Calico (acceptable) | Apache 2 |
| cert-manager | 1.16 | Automated TLS | manual (no thanks) | Apache 2 |
| external-secrets | 0.10 | Sync from Vault / Secrets Manager | sealed-secrets (less ergonomic) | Apache 2 |
| Docker | 27 | Container runtime | Podman (smaller buildx ecosystem) | Apache 2 |
| Docker Compose | v2.30 | Local dev orchestration | Tilt (more powerful but heavier) | Apache 2 |

---

## Monitoring (business)

| Tech | Use | Notes |
| :--- | :--- | :--- |
| ClickHouse Cloud (24.10) | OLAP for benchmarks + cost-per-tenant analytics | ~$1,200 / month at our projected scale |
| Cube.js (1.0) | Pre-aggregations / semantic layer between ClickHouse and dashboard widgets | Apache 2; self-hosted |
| dbt Core (1.9) | Transformations into ClickHouse marts | Apache 2 |
| Metabase (self-host) (51) | Internal exec dashboards (not customer-facing) | AGPL v3; we don't redistribute |

---

## CI/CD

| Tech | Version | Why | Alternatives | License / Cost |
| :--- | :--- | :--- | :--- | :--- |
| GitHub Actions | n/a | Hosted runners, mature marketplace, owned by GitHub (where the code lives) | CircleCI (cost); Buildkite (great, self-hosted runners we'd manage) | Commercial / included with GitHub Team |
| Turborepo | 2.3 | Monorepo task runner, remote cache | Nx (heavier); pnpm scripts alone (no caching) | MPL 2 |
| Renovate | 39 | Dependency updates | Dependabot (less group control) | AGPL v3 (self-host) |
| Trivy | 0.58 | Container scanning | Clair (less active); Snyk (commercial) | Apache 2 |
| Snyk | n/a | App + dependency vuln scanning (paid extras) | Trivy + sca alone (less product polish) | Commercial / ~$50/user/month |
| Bandit | 1.8 | Python security linter | semgrep (also great; we use both) | Apache 2 |
| Semgrep | 1.95 | Cross-language SAST | CodeQL (great but slower CI) | LGPL 2.1 |
| Playwright | 1.49 | E2E tests | Cypress (lower parallelism); WebdriverIO (less DX) | Apache 2 |
| Vitest | 2.1 | Unit tests for TS | Jest (slower; ESM friction) | MIT |
| pnpm | 9.15 | Fast, content-addressed | npm (slower); yarn berry (rougher edges) | MIT |

---

## Local dev convenience

| Tech | Use | Notes |
| :--- | :--- | :--- |
| MinIO | S3-compatible local | Apache 2 |
| LocalStack Lite | n/a | Avoided — too flaky |
| ngrok / Tailscale | Webhook ingress in dev | Commercial free tier |

---

## Indicative monthly cost (production, 100 tenants)

| Category | Monthly USD |
| :--- | ---: |
| Compute (EKS nodes, mix of c7g/m7g/g5) | 12,000 |
| Aurora Postgres (1 cluster pool + 12 silos avg) | 8,500 |
| ClickHouse Cloud | 1,200 |
| Redis (ElastiCache + Vault-fronted) | 600 |
| Qdrant compute | 1,200 |
| OpenSearch | 1,800 |
| MSK Kafka | 700 |
| S3 + Object Lock | 1,400 |
| KMS + Secrets Manager | 200 |
| CloudFront + WAF | 600 |
| Anthropic API | 6,000 |
| Voyage embeddings | 200 |
| DocuSign (50 seats avg) | 2,000 |
| GitHub + GitHub Actions | 400 |
| Sentry / Langfuse / Grafana infra | 1,000 |
| Datadog (optional partner integration) | 0 |
| **Total** | **~37,800** |

At our list price (mix of tiers), gross margin holds at ~72% (target by Q4 2027).

---

## Notes on AGPL / BSL components

- We **self-host and modify** Grafana, Loki, Tempo (AGPL v3) without redistributing — compliant.
- We **self-host** Sentry under BSL 1.1 for internal use — compliant.
- We **do not ship** MinIO; only used in local dev — no obligation.
- HashiCorp products (Vault, Terraform) under BSL 1.1: we evaluate OpenTofu migration for Terraform annually; if BSL terms ever conflict with our SaaS model, we have a migration plan with budget for 4 engineer-weeks.

