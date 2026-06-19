# brsr-web — Next.js 15 frontend

Single-tenant SaaS UI for the BRSR platform. ~30 pages covering the full ESG
workflow: upload → review → metrics → frameworks → disclosure → reports.

## Stack
- Next.js 15.5 (App Router) + React 19 RC
- TanStack Query for server state
- Zustand for client state
- Tailwind CSS 3 + Radix UI primitives + ShadCN-style components
- Lucide icons
- Recharts for KPI charts
- Sonner for toasts

## Run

```bash
cd apps/web
npm install
# point at production API
NEXT_PUBLIC_API_URL=https://srv1763596.hstgr.cloud/api/v1/v1 npm run dev
# or point at local API
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1/v1 npm run dev
# http://localhost:3000
```

## Authenticated routes

| Path | Page |
|---|---|
| `/login` | NextAuth signin |
| `/dashboard` | Executive KPIs + emissions trend |
| `/hierarchy` | Company entity tree |
| `/files` | Document index + upload |
| `/files/[id]` | File detail + extracted fields + Original download |
| `/extraction-review` | Review queue (DRAFT + low confidence) |
| `/metrics` | Canonical registry + metric events |
| `/frameworks/[fw]` | BRSR / GRI / TCFD / IFRS S2 drilldown |
| `/calculations` | CalcRun history |
| `/carbon` | Scope summary |
| `/carbon/scope1` `/scope2` `/scope3` | per-scope detail |
| `/carbon/net-zero` `/macc` `/abatement` `/credits` | climate pages |
| `/reports` | Generated reports |
| `/reports/generate` | 6-step wizard |
| `/materiality` | Topics + stakeholders + matrix |
| `/suppliers` | Supplier scorecards |
| `/assurance` | Snapshots + exceptions |
| `/audit-log` | Append-only event log with CSV/JSONL export |
| `/copilot` | LLM chat over tenant data |
| `/settings/organization` `/users` `/integrations` | Admin |

## Key patterns

### API client + queries

`src/lib/api/client.ts` — shared axios instance with JWT interceptor.
`src/lib/api/endpoints.ts` — typed endpoint constants.
`src/lib/api/queries/index.ts` — TanStack Query hooks.

```ts
// Pattern
const { data, isLoading, isError, error, refetch } = useDashboardKpis();
if (isError) return <DataErrorBanner onRetry={refetch} />;
if (isLoading) return <PageSkeleton />;
```

### Resolving raw IDs to display names

The API returns `actorUserId`, `uploadedBy`, etc. as raw cuids. Resolve via:

```ts
import { useUsers } from "@/lib/api/queries";
import { userLabel } from "@/lib/utils";

const { data: users } = useUsers();
const label = userLabel(someUserId, users);   // "BRSR Admin" or "user/2p939m" fallback
```

### Defensive helpers

`src/lib/utils.ts`:
- `initials(name)` — never crashes on undefined
- `shortId(id, prefix)` — formats a cuid as `<prefix>/<last6>`
- `userLabel(id, users)` — resolves with fallback chain

`src/lib/format.ts`:
- `formatRelative(date)` — returns "—" on null/invalid; never throws RangeError
- `formatBytes`, `formatINR`, `formatTonnesCO2e`, `formatPercent`

### Components

`src/components/common/*` — shared (`page-header`, `kpi-card`, `data-error-banner`, `empty-state`, `loading-skeleton`, `scope-breadcrumb`).
`src/components/<domain>/*` — domain-specific (`brsr/question-card`, `files/file-card`, `extraction/review-queue-item`).

## Type-check + lint

```bash
npm run typecheck            # tsc --noEmit
npm run lint
```

## Common pitfalls

1. **API field-name mismatch** — backend returns snake_case in some places (DB columns) but camelCase in others (DTOs). Always normalize at the page level, never assume the backend matches your TypeScript type.
2. **Raw ID leakage** — always resolve cuids to human-readable labels before display.
3. **Date guards** — wrap any `formatRelative()` / `new Date()` with `formatRelative()` which handles null/invalid.
4. **`null` rendered as text** — check for `value == null` not `value !== undefined`; the backend nulls are not undefined.
5. **Query errors** — destructure `{ data, isError, error, refetch }`, never just `{ data }`. The `DataErrorBanner` component is the canonical error UX.

## Debugging

```bash
# In dev, open browser DevTools:
#  - React Query devtools panel for query state
#  - Network tab for API calls (look for 4xx/5xx with red highlight)
#  - Console for client errors

# In prod, check if a specific page rendered:
curl -sk -o /dev/null -w '%{http_code}\n' https://srv1763596.hstgr.cloud/dashboard

# Tail web logs (Next.js server-side)
docker logs -f brsr-web

# Verify a query hook returns data
JWT=$(curl -sk -X POST https://srv1763596.hstgr.cloud/api/v1/v1/iam/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@brsr.ai","password":"BRSR@Admin#2026"}' | jq -r .data.token)
curl -sk https://srv1763596.hstgr.cloud/api/v1/v1/dashboard/kpis -H "Authorization: Bearer $JWT" | jq
```

## Playwright walkthroughs

`qa-ui-test/` (sibling directory) has end-to-end Playwright scripts:

```bash
cd ../../qa-ui-test
node walkthrough.js       # 30 pages, captures shots-walk/<page>.png
node deep-scan.js          # hunts for raw cuids, NaN, undefined in rendered text
node audit-end-to-end.js   # full admin + demo user journey
```
