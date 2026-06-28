# Running brsr-uedi natively (no Docker)

Merged app: **logic = brsr-v2-main (3).zip**, **UI = brsr-v2-main.zip** (apps/web +
packages/ui), **extraction engine = UEDI** vendored into `services/ai-engine`.

## Services & ports
| Service | Port | Start command |
|---|---|---|
| Postgres 16 (portable) | 5433 | `C:\Users\admin\esg-runtime\pgsql\bin\pg_ctl -D ...\data -o "-p 5433" start` |
| MinIO (S3) | 9000/9001 | `minio.exe server ...\minio-data --address :9000 --console-address :9001` |
| ai-engine (UEDI) | 8100 | `cd services/ai-engine && python -m uvicorn app.main:app --port 8100` |
| api (NestJS) | 4000 | `cd services/api && node dist/src/main.js` (build: `pnpm exec tsc -p tsconfig.json`) |
| web (Next.js) | 3000 | `cd apps/web && pnpm exec next dev -p 3000` |

Redis is **not** run → api is `degraded` (queues off) but fully functional for
upload→extract→view. Keycloak/OPA are disabled (web uses a Credentials provider
that posts to the api, so no Keycloak needed).

## Logins (seeded)
- `admin@theesg.in` / `Admin@1234`  (admin)
- `priya@theesg.in` / `Priya@1234`  (sustainability manager)

## Use it
1. Open http://localhost:3000 → log in.
2. Evidence → Upload a bill PDF (e.g. from `E:\IST\Proposal\NHAI\Light Bills`).
3. The api stores it in MinIO and calls the UEDI ai-engine `/extract`; UEDI runs
   native-PDF / **Google Document AI** / GPT-4o → canonical → validate → confidence,
   then posts the result back to `/api/v1/v1/extraction/callback`.
4. The extracted canonical fields appear on the evidence; low-confidence/flagged
   docs are routed to review.

## Proven end-to-end
`python e2e_proof.py "<bill.pdf>"` — login → upload → UEDI extract → read back.
Verified live on a scanned Marathi MSEDCL bill: account `411340003306`, ₹430,
`ocr_source=document_ai`, stored in Postgres with status READY.

## Integration notes / fixes applied
- `services/ai-engine/app/main.py` rewired to run UEDI (`uedi_process`) while
  keeping the original `/extract` + callback contract; engine vendored under
  `services/ai-engine/{packages,services}`.
- `services/api/.env`: `INTERNAL_API_URL=http://localhost:4000` (default was the
  docker host `api:4000` → callback DNS failure).
- `services/ai-engine/app/config.py`: `extra="ignore"` so unrelated env is tolerated.
- Real API routes are at `/api/v1/v1/...` (global prefix `api/v1` + URI version v1);
  health at `/v1/health`.

## Known caveats
- Login response omits `user.roles` → the web may hide some role-gated buttons even
  though the api authorizes server-side. (Surface roles in the login DTO to fix.)
- Meters/energy_flow are empty on Document-AI-routed bills (reading rows not parsed
  from DocAI text yet).
- pre-existing api TS type errors are non-fatal (`tsc` emits anyway).
