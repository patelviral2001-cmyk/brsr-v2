# THE ESG

**AI Native Sustainability Operating System.**
Upload evidence. Get audit-ready ESG disclosures.

Converts bills, spreadsheets and forms into structured, traceable ESG Data Points,
then assembles BRSR / GRI / CDP disclosures from a single ESG Registry. Every
disclosed number traces back to the original document that produced it.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui |
| Backend | NestJS 10 (TypeScript) + Prisma 5 |
| Database | PostgreSQL 16 |
| Object storage | MinIO (S3-compatible) |
| Queue | Redis + BullMQ |
| AI engine | Python 3.11 FastAPI + OpenAI structured outputs + Tesseract OCR |
| Edge | Caddy 2 (automatic HTTPS) |
| Target | Single Hostinger / DigitalOcean VPS via Docker Compose |

## Repo layout

```
apps/web/                 Next.js frontend
services/api/             NestJS REST API + Prisma schema + seed
services/ai-engine/       FastAPI extraction service (OpenAI + OCR)
infra/caddy/              Caddyfile (reverse proxy + TLS)
infra/postgres/           Postgres init SQL
infra/scripts/            backup-db.sh / restore-db.sh / init-minio.sh
scripts/deploy.sh         Idempotent VPS deploy
docker-compose.prod.yml   Production stack
data/validation/          Ground-truth corpus for extraction validation
```

## Deploy

```bash
ssh root@<your-vps>
cd /opt/brsr-v2
cp .env.production.example .env  # then fill DOMAIN, secrets, OPENAI_API_KEY
./scripts/deploy.sh                              # routine update
FRESH_DB=true SEED_DB=true ./scripts/deploy.sh   # first deploy / destructive reset
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full VPS bring-up.

## The 10 things that have to work end-to-end

1. Create a Site (`Admin → Sites`)
2. Upload an electricity bill (`Evidence → Upload`)
3. AI extraction runs automatically
4. Review extracted fields (`Evidence → row → Review screen`)
5. Correct mistakes inline
6. **Enter** to Confirm
7. Data Points are created
8. View them in Data Hub
9. Click any Data Point to view audit trail
10. Trace back to the original evidence file

Validate against the 12 real MSEDCL bills in [data/validation/ground-truth.md](data/validation/ground-truth.md).

## Security

Hardening notes in [SECURITY.md](SECURITY.md) and [SECURITY-PROD.md](SECURITY-PROD.md).
