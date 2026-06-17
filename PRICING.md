# BRSR AI Platform — Pricing

This document explains how we charge, what is included, how the per-tenant economics work, and how we go to market. It is a working internal document; the public price book lives at `https://brsrai.com/pricing` and may differ at the edges (regional promos, partner deals).

Last reviewed 2026-06-16. Pricing committee meets monthly.

---

## 1. Tier Summary

| Tier | Annual list (INR) | Target ICP | Seats | Facilities | Suppliers | Reports / year |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: |
| Compliance | 6,00,000 | Top 1,000 listed entity required to file BRSR Core | 5 | 5 | 50 | BRSR Core only |
| Enterprise | 18,00,000 | Top 500 listed, full BRSR + GRI | 25 | 30 | 500 | 4 (BRSR Core, BRSR Comp, GRI, internal) |
| Group | 60,00,000 | Top 100 conglomerates, multiple legal entities | 100 | unlimited | 5,000 | unlimited |
| Listed Premium | 1,20,00,000+ | Top 30, regulated FIs, multi-jurisdiction | unlimited | unlimited | unlimited | unlimited |

All prices ex-GST. Annual term, paid quarterly in advance. Multi-year discount: 10% for 2-year, 18% for 3-year, plus price-lock.

---

## 2. What's Included per Tier

### 2.1 Compliance (INR 6 L / year)

- Pool tenant on shared infra (RLS isolation)
- 5 seats
- 1 legal entity, up to 5 facilities
- BRSR Core (top 9 indicators + assurance pack)
- AI Extraction: 200 documents / month
- AI Copilot: 1,000 messages / month
- Email support, 24 h response (business hours IST)
- 99.5% SLA on availability
- Region: ap-south-1 (Mumbai)
- Data retention: 7 years
- Standard sub-processor list

Excluded: GRI, TCFD, supplier portal, custom branding.

### 2.2 Enterprise (INR 18 L / year)

Everything in Compliance, plus:

- Silo tenant (dedicated schema)
- 25 seats
- Up to 5 legal entities, 30 facilities
- BRSR Comprehensive, GRI 2025, TCFD core
- Supplier portal: 500 suppliers
- AI Extraction: 2,000 documents / month
- AI Copilot: 25,000 messages / month
- SSO via SAML / OIDC (customer IdP)
- ERP connector (1 ERP: SAP / Oracle / Tally)
- Whitelabel supplier portal branding
- Email + chat support, 8 h response
- 99.9% SLA
- Optional region: ap-south-2 (Hyderabad)
- Quarterly Customer Success review

Excluded: dedicated infra, BYOK, on-prem deployment.

### 2.3 Group (INR 60 L / year)

Everything in Enterprise, plus:

- Dedicated Aurora cluster + Redis + Qdrant collection
- 100 seats
- Unlimited legal entities and facilities
- Up to 5,000 suppliers
- IFRS S1 / S2 climate, CSRD readiness (limited), PCAF financed emissions
- AI Extraction: 10,000 documents / month
- AI Copilot: 200,000 messages / month
- 2 ERP connectors, custom connectors via paid services
- Custom dashboards + Cube.js semantic layer
- API access (REST + GraphQL) with 100k req / hour quota
- Webhooks for all domain events
- White-labelled assurance workspace for the customer's Big-4 partner
- Chat + phone + dedicated Slack channel, 4 h response, 1 h for SEV-1
- 99.95% SLA, financially backed
- Active-passive multi-AZ + cross-region replica
- Quarterly executive business review with CISO + Product

Excluded: dedicated VPC, BYO KMS, on-prem.

### 2.4 Listed Premium (INR 1.2 Cr+ / year)

Everything in Group, plus:

- Dedicated single-tenant VPC in customer-chosen region
- Unlimited seats, facilities, suppliers, reports
- Choice of LLM backend (Anthropic API or Amazon Bedrock for sovereignty)
- Customer-managed KMS keys (BYOK / BYOK-HSM)
- Customer-managed Vault Transit option
- Air-gapped mode available (no internet egress; offline LLM via Bedrock VPC endpoint)
- 24/7/365 phone + Slack support, 30 min response, 15 min for SEV-1
- 99.99% SLA, with credit schedule
- DR active-active across two regions
- Dedicated Customer Success Manager + Solution Architect
- Monthly executive briefing
- Custom features (mutually agreed roadmap)
- Source-code escrow option

Pricing for Listed Premium is bespoke; 1.2 Cr is the floor.

---

## 3. Per-Tenant Cost Breakdown (COGS)

Assumes a representative customer in each tier, typical usage. INR figures, monthly run-rate.

### 3.1 Compliance (target: 70%+ gross margin)

| Component | Cost (INR / mo) | Notes |
| :--- | ---: | :--- |
| EKS compute share | 1,800 | Multi-tenant pool, allocated by metric volume |
| Aurora share | 2,200 | Shared pool cluster cost / N tenants |
| Redis share | 200 | |
| Qdrant share | 350 | Shared collection |
| OpenSearch share | 400 | |
| S3 evidence storage | 600 | ~25 GB at S3 Standard + Object Lock |
| Anthropic API | 4,800 | ~200 docs/mo at INR 16/doc + light Copilot |
| Voyage embeddings | 100 | |
| Observability | 200 | Loki + Prometheus + Langfuse share |
| Support + CS allocation | 1,500 | 1 CS per 80 Compliance tenants |
| **Total COGS** | **12,150** | |
| List price | 50,000 / mo | (6 L / 12) |
| **Gross margin** | **76%** | |

### 3.2 Enterprise (target: 72%)

| Component | Cost (INR / mo) | Notes |
| :--- | ---: | :--- |
| Dedicated schema share + connection pool | 5,500 | |
| Aurora silo share | 6,800 | |
| Redis share | 800 | |
| Qdrant per-tenant collection | 1,800 | |
| OpenSearch share | 1,000 | |
| S3 storage | 1,800 | ~80 GB |
| Anthropic API | 22,000 | ~2,000 docs/mo + Copilot 25k msgs |
| Voyage embeddings | 400 | |
| Observability | 800 | |
| Customer Success | 7,500 | 1 CSM per 25 Enterprise tenants |
| Total COGS | 48,400 | |
| List price | 1,50,000 / mo | (18 L / 12) |
| Gross margin | 68% | (target 72%; will tune Anthropic prompt caching) |

### 3.3 Group (target: 70%)

| Component | Cost (INR / mo) | Notes |
| :--- | ---: | :--- |
| Dedicated Aurora cluster | 38,000 | r6g.large writer + 1 reader |
| Dedicated Redis | 6,500 | |
| Dedicated Qdrant cluster | 18,000 | |
| Dedicated OpenSearch | 14,000 | |
| EKS compute | 28,000 | api + ai-engine + workflow scaled |
| S3 storage | 6,000 | ~250 GB |
| Anthropic API | 88,000 | ~10,000 docs/mo, Copilot 200k msgs |
| Voyage embeddings | 1,200 | |
| ClickHouse Cloud share | 6,000 | |
| Observability | 2,500 | |
| Customer Success + SA | 18,000 | 1 CSM + 0.25 SA per Group tenant |
| Total COGS | 2,26,200 | |
| List price | 5,00,000 / mo | (60 L / 12) |
| Gross margin | 55% (Year 1), → 70% (Year 3 via prompt caching, reservations, scale) | |

### 3.4 Listed Premium (target: 60% in year 1, 68% Year 3)

| Component | Cost (INR / mo) | Notes |
| :--- | ---: | :--- |
| Dedicated VPC + EKS | 1,20,000 | |
| Aurora dedicated cluster (HA) | 1,40,000 | |
| Bedrock / Anthropic | 2,80,000 | ~30,000 docs/mo |
| KMS + CloudHSM | 25,000 | |
| Storage | 18,000 | |
| Voyage + embeddings | 4,000 | |
| Observability dedicated | 14,000 | |
| Dedicated CSM + SA + 24x7 oncall allocation | 1,20,000 | |
| Total COGS | 7,21,000 | |
| List price | 10,00,000 / mo | (1.2 Cr / 12) — at floor |
| Gross margin | 28% (Year 1) → 60%+ at Year 3 with renewals, reservations, optimisation | |

Listed Premium customers also tend to commit to multi-year deals worth 1.5-2 Cr+, often with paid implementation services. The Year-1 margin reflects deep onboarding investment.

---

## 4. Unit Economics

### 4.1 Customer acquisition

| Tier | CAC | Sales cycle | LTV (3-year, with 10% net retention upside) |
| :--- | ---: | ---: | ---: |
| Compliance | INR 80,000 | 4 weeks | INR 19 L |
| Enterprise | INR 3,50,000 | 12 weeks | INR 60 L |
| Group | INR 12,00,000 | 6 months | INR 2.2 Cr |
| Listed Premium | INR 35,00,000 | 9-12 months | INR 5 Cr+ |

LTV / CAC > 6 across all tiers (target > 5).

### 4.2 Year-3 ARR target

| Tier | Tenants Year 3 | ARR (Cr) |
| :--- | ---: | ---: |
| Compliance | 220 | 13.2 |
| Enterprise | 240 | 43.2 |
| Group | 60 | 36.0 |
| Listed Premium | 22 | 27.6 |
| Services / implementation | n/a | 8.0 |
| **Total ARR** | 542 | **128.0** |

Implementation services priced at INR 8-25 L for Group / Listed Premium (mostly recoverable in margin via accelerated time-to-value for the customer).

### 4.3 Gross margin trajectory

| Year | Blended GM |
| :--- | ---: |
| 1 | 41% |
| 2 | 58% |
| 3 | 70% (target) |

Levers: prompt caching (Anthropic 5x cheaper on cached tokens), Voyage volume discounts, reserved instances (Aurora 35% off, EC2 60% off), scaled CS (lower CSM ratio).

---

## 5. Sales Motion

We run a hybrid GTM.

### 5.1 PLG funnel (Compliance and small Enterprise)

- Landing pages targeted at "Top 1,000 listed entity who needs to file BRSR Core".
- Self-serve trial: 30 days, capped at 50 evidence files, no real SEBI lodging.
- In-product nudges to upgrade (gating on "lodge with SEBI", "add 6th facility", "invite supplier #51").
- Conversion target: 12% trial-to-paid.

### 5.2 Mid-market sales (Enterprise)

- 4-person AE team (Bengaluru + Mumbai + NCR).
- Outbound to Director-of-Sustainability and CFO personas.
- Pipeline sources: BSE 500 list, sustainability conferences (TERI, CII, BAQ Asia), references from Big-4 partners.
- 12-week median sales cycle; 22 logos / year / AE quota.

### 5.3 Enterprise sales (Group + Listed Premium)

- 2-person enterprise team (1 Strategic AE + 1 Account Director, both Mumbai).
- Deal team includes Solution Architect, CISO (for security review), and Customer Success Director.
- Partner-led pipeline: Big-4 partnerships (E&Y, Deloitte, KPMG, PwC) account for ~40% of pipeline.
- Custom RFP responses, multi-month POCs (in customer's sandbox tenant), board-level demos.
- 6-9 month median sales cycle; 4-6 logos / year / AE quota.

### 5.4 Channel

- Big-4 referral program: 12% on Year-1 ACV.
- Boutique sustainability consultants (a-la-carte): white-label option for sub-Compliance tier customers.
- AWS Marketplace listing for Enterprise+ (private offers).

---

## 6. Implementation Services Pricing

Optional for Enterprise; typical for Group; standard for Listed Premium.

| Service | Compliance | Enterprise | Group | Listed Premium |
| :--- | ---: | ---: | ---: | ---: |
| Onboarding (org setup + materiality kickoff) | included | INR 1.5 L | INR 6 L | INR 18 L |
| ERP connector (1 ERP) | n/a | INR 3 L | INR 8 L | included |
| Custom dashboard build | n/a | INR 1 L / dash | INR 80 k / dash | included |
| Big-4 assurance bridge | n/a | INR 4 L | INR 8 L | included |
| Training (2 days, on-site) | INR 1.5 L | INR 2.5 L | included | included |
| Air-gapped deployment | n/a | n/a | n/a | INR 50 L (one-time) |

Services are delivered by our in-house Implementation team (Bengaluru) for Compliance / Enterprise; by a hybrid of in-house + partner SI (Tata Consultancy, Wipro, or one of the Big-4) for Group / Listed Premium.

---

## 7. Pricing Policies

- **Annual commit, paid quarterly**: standard.
- **Auto-renewal**: 12 months, 60-day opt-out window.
- **Price increase cap**: 7% per annual renewal (or CPI + 2%, whichever lower).
- **Multi-year discount**: 10% for 2-yr, 18% for 3-yr.
- **Non-profit discount**: 25% (Compliance + Enterprise only).
- **Educational discount**: 60% for IIM / IIT research seats (Compliance only).
- **Pilot pricing**: 50% of list for first 12 months for design-partner cohort (capped at 10 design partners total).
- **SLA credits**: pro-rated against monthly fee per the SLA schedule in the MSA.

---

## 8. Competitive Pricing

| Competitor | Tier | Roughly | Notes |
| :--- | :--- | :--- | :--- |
| Sphera | Enterprise | INR 25-40 L | Heavyweight, slow time-to-value |
| Workiva | Enterprise | INR 30-60 L | Excel-replacement DNA, weaker on AI |
| Watershed | Enterprise | INR 35-70 L | Carbon-first, weaker on BRSR |
| EcoVadis | Supplier-focused | INR 10-30 L | We integrate, not compete on ratings |
| Indian SI custom builds (TCS, Wipro) | Group + | INR 80 L-3 Cr | One-off, no platform; we are 70% cheaper at 3-yr TCO |

We position as "purpose-built for BRSR with AI-native extraction" — the only solution in this exact slot for the Indian market.

