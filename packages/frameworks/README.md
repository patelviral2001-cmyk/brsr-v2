# @brsr/frameworks

The single source of truth for multi-framework ESG disclosures in BRSR-v2. This package is consumed by the backend (`services/api`), the AI extraction engine (`services/ai-engine`), the reporting workflow service (`services/workflow`), the Copilot (`services/copilot`), and the frontend (`apps/web`).

## Architecture: registry-first, frameworks as views

The fundamental insight: **frameworks do not own data, they ask questions**. The same number (e.g. grid electricity consumed) is asked for by BRSR P6.E.1, GRI 302-1, SASB IF-EU-130a.1, TCFD Metrics-a, IFRS S2 §29(a), ESRS E1-5 and CDP C8.2a. If we shape our database around any one of those frameworks, we end up duplicating data and drift between disclosures.

So the registry is layered:

```
                +---------------------------+
                |   CANONICAL_METRICS       |   <-- src/canonical/metrics.ts
                |   electricity_kwh, ...    |       SOURCE OF TRUTH
                +---------------------------+
                            ^
              +-------------+--------------+--------------+
              |             |              |              |
        +----------+  +----------+   +----------+   +----------+
        | BRSR     |  | GRI      |   | SASB     |   |  TCFD    |
        | P6.E.1   |  | 302-1    |   | IF-EU... |   |  Metrics |
        +----------+  +----------+   +----------+   +----------+
              ^             ^              ^              ^
              +-------------+--------------+--------------+
                            |
                +---------------------------+
                |   CROSSWALKS              |   <-- src/crosswalks/index.ts
                +---------------------------+
```

- `CANONICAL_METRICS` defines what a measurement IS: a stable `key`, a canonical unit, allowed dimensions, aggregation rule, value constraints, GWP basis (for GHG), data-quality tier and aliases for AI extraction.
- Framework files (`brsr.ts`, `gri.ts`, …) define what a regulator ASKS: section IDs, question text, response type, narrative templates and the list of canonical keys that *answer* the question.
- `CROSSWALKS` inverts the mapping: for any canonical metric, which frameworks/sections does it satisfy?

When a user fills in `electricity_kwh` once, the platform automatically answers the corresponding BRSR, GRI, SASB, TCFD, IFRS, ESRS and CDP disclosures via the crosswalk.

## What's in the box

| Path | What it gives you |
| ---- | ----------------- |
| `src/canonical/metrics.ts` | ~200 canonical ESG metrics across Environment, Social and Governance, each with units, dimensions and AI aliases. |
| `src/frameworks/brsr.ts` | 200+ BRSR disclosures across the 9 NGRBC principles, with BRSR Core flags. |
| `src/frameworks/gri.ts` | GRI Universal + topic standards (302/303/305/306/401/403/404/405/308/414). |
| `src/frameworks/sasb.ts` | SASB industry standards for India-relevant sectors (RR-SE, RT-EE, EM-CM, EM-IS, RT-IG, TC-IM, TC-SI). |
| `src/frameworks/tcfd.ts` | All 11 TCFD recommendations. |
| `src/frameworks/ifrs.ts` | IFRS S1 (general) and S2 (climate) disclosures. |
| `src/frameworks/csrd-esrs.ts` | All 12 ESRS (ESRS 1, 2, E1-E5, S1-S4, G1). |
| `src/frameworks/cdp.ts` | CDP Climate, Water and Forests modules. |
| `src/crosswalks/index.ts` | Canonical-to-framework matrix. |
| `src/factors/cea-india.ts` | CEA v18 (2024) grid emission factors per state. |
| `src/factors/defra.ts` | DEFRA 2024 fuel & energy combustion factors. |
| `src/factors/ipcc-gwp.ts` | IPCC AR5, AR6-100yr and AR6-20yr GWP tables. |

## Versioning policy

The registry is versioned, but individual metrics are also versioned via `version` + `valid_from`. This is important: when CEA publishes v19 grid factors mid-FY, restating historical emissions requires the OLD factor for periods before the cutover.

## Programmatic API

```ts
import {
  CANONICAL_METRICS,
  getCanonicalMetric,
  getCrosswalk,
  getFrameworksContainingMetric,
  getDisclosuresAnsweredByMetric,
  getGwp,
  getCeaFactor,
} from "@brsr/frameworks";

const m = getCanonicalMetric("electricity_kwh");
const xw = getCrosswalk("electricity_kwh");
// => { BRSR: ['P6.E.1'], GRI: ['GRI 302-1'], ... }

const gwp = getGwp("CH4", "AR6_100"); // 27
const ef  = getCeaFactor("Maharashtra", 2024); // 0.85
```

## Conventions

- All keys are snake_case ASCII.
- Units use UCUM-ish abbreviations: `kwh`, `kl`, `kg`, `tco2e`, `pct`, `inr`.
- BRSR Core flag = the subset mandated for the top 1000 listed entities by market cap.
- GRI codes follow `GRI {standard}-{disclosure}`; SASB codes follow the official `<SECTOR>-<TOPIC>-<NUMBER>` format.
