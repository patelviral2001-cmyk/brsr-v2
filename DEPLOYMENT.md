# BRSR AI Platform v2 — Production Deployment Guide (Hostinger VPS)

This guide walks you from a fresh Hostinger account to a fully live BRSR
AI Platform running on a single VPS, terminating TLS, and ready for paying
clients to do real AI extraction with OpenAI.

Target hardware: **Hostinger KVM 4** — 16 GB RAM / 4 vCPU / 200 GB NVMe /
Ubuntu 24.04 LTS.

---

## 1. Choose a Hostinger VPS plan

| Plan   | RAM   | vCPU | Disk   | Verdict for BRSR |
|--------|-------|------|--------|------------------|
| KVM 1  | 4 GB  | 1    | 50 GB  | Will not boot the AI engine (OOM). |
| KVM 2  | 8 GB  | 2    | 100 GB | API + web OK, but AI engine pushes over the limit during PDF extraction. |
| **KVM 4** | **16 GB** | **4** | **200 GB** | Recommended. Headroom for OCR + LLM context + Postgres tuning. |
| KVM 8  | 32 GB | 8    | 400 GB | Use only when you need to host 100+ active tenants. |

Why KVM 4: the AI engine alone runs to ~4 GB during multi-page PDF
extraction (Tesseract OCR + sentence-transformers + an OpenAI streaming
context). Postgres is pinned to `shared_buffers=2GB`. Redis is 512 MB.
Web + API ~1.5 GB combined. That is ~9 GB working set with comfortable
swap headroom on a 16 GB box.

---

## 2. Provision the VPS

1. Hostinger panel → **VPS** → **Buy / Manage**.
2. **OS**: Ubuntu 24.04 LTS (64-bit).
3. **Datacenter**: Mumbai (lowest latency for Indian users; Sao Paulo or
   Frankfurt are fine for other regions).
4. **SSH key**: paste your public key. (Password auth works too, but use
   a strong one — see SECURITY-PROD.md.)
5. Note the public IP — call it `VPS_IP`.

---

## 3. DNS (recommended)

You have two options:

**Free, fast** — use the Hostinger-provided hostname. Each VPS gets one
like `srv1234.hstgr.cloud`. Caddy will obtain a Let's Encrypt cert for
it automatically.

**Custom domain** — Hostinger panel → **Domains** → **DNS / Nameservers**.
Add an **A record** with name `@` (or `brsr`) pointing to `VPS_IP`. TTL
300. Wait until `dig +short brsr.example.com` returns the VPS IP before
running deploy.sh.

---

## 4. SSH in

```bash
ssh root@VPS_IP
```

---

## 5. Bootstrap the VPS

The repo ships an idempotent bootstrap script that installs Docker,
configures firewall + fail2ban + swap, and creates the `brsr` app user.

```bash
# (Option A) one-liner from GitHub
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/brsr-v2/main/scripts/install-vps.sh \
  | sudo REPO_URL=https://github.com/YOUR_USER/brsr-v2.git bash

# (Option B) clone first, then run locally
git clone https://github.com/YOUR_USER/brsr-v2.git /tmp/brsr-v2
sudo REPO_URL=https://github.com/YOUR_USER/brsr-v2.git \
  bash /tmp/brsr-v2/scripts/install-vps.sh
```

This will:

- update apt and install curl, git, ufw, fail2ban, jq, htop
- install Docker engine + compose v2 plugin
- harden the firewall (only 22, 80, 443)
- enable fail2ban for SSH
- enable unattended security upgrades
- create an 8 GB swapfile (set `vm.swappiness=10`)
- create app user `brsr`
- clone the repo into `/home/brsr/brsr-v2`

---

## 6. Switch to the app user

```bash
su - brsr
cd brsr-v2
```

---

## 7. Configure the environment

```bash
cp .env.production.example .env
nano .env
```

At minimum set:

```env
DOMAIN=brsr.example.com                 # or srv1234.hstgr.cloud
DB_PASSWORD=$(openssl rand -hex 16)     # paste actual output, not the literal
JWT_SECRET=$(openssl rand -hex 32)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
INTERNAL_CALLBACK_SECRET=$(openssl rand -hex 32)
MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)
OPENAI_API_KEY=sk-...                   # your real OpenAI key
```

Then update `DATABASE_URL` to match `DB_PASSWORD` (currently has
`CHANGE_ME` placeholder):

```env
DATABASE_URL=postgresql://brsr:<your-DB_PASSWORD>@postgres:5432/brsr?schema=public
```

Helpful one-liner to generate all secrets at once:

```bash
for k in DB_PASSWORD JWT_SECRET NEXTAUTH_SECRET INTERNAL_CALLBACK_SECRET MINIO_ROOT_PASSWORD; do
  echo "$k=$(openssl rand -hex 32)"
done
```

---

## 8. First deploy (with seed data)

Make the scripts executable, then deploy:

```bash
chmod +x scripts/*.sh
SEED_DB=true ./scripts/deploy.sh
```

What it does:

1. Validates `.env` has all required vars.
2. `docker compose build` for api / ai-engine / web.
3. Starts postgres, redis, qdrant, minio; waits for `healthy`.
4. Runs `minio-init` to create buckets (`brsr-evidence` with object-lock,
   `brsr-reports`, `brsr-uploads`, `brsr-extracts`, `brsr-backups`).
5. Runs `prisma migrate deploy`.
6. Seeds the demo data (`prisma/seed.ts`).
7. Starts ai-engine, api, web, caddy.

First build is ~10 minutes (downloading sentence-transformers + the
NestJS deps). Subsequent builds are layer-cached.

---

## 9. Verify

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f web
```

All services should show `running (healthy)`.

Hit the URL in a browser: `https://<DOMAIN>` — you should see the login
screen and a valid Let's Encrypt padlock. Sign in with the demo
credentials printed at the end of the seed log (or look in
`services/api/prisma/seed.ts`).

---

## 10. Day-2 operations

### Update to a new release
```bash
cd ~/brsr-v2
./scripts/deploy.sh
```

### Logs
```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f ai-engine --tail 200
```

### Backup
```bash
./scripts/backup.sh
```

Schedule daily backups (run as `brsr` user):

```bash
crontab -e
0 2 * * *  /home/brsr/brsr-v2/scripts/backup.sh >> /var/log/brsr-backup.log 2>&1
```

### TLS renewal
Caddy renews Let's Encrypt automatically. Certs live in the `caddydata`
volume. To force a renewal:

```bash
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Live monitoring
```bash
docker stats                                                # CPU/mem per container
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U brsr -d brsr -c 'SELECT * FROM pg_stat_activity;' # who is on Postgres
```

### Open a Postgres shell
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U brsr -d brsr
```

### Re-seed (DANGEROUS — wipes app data)
```bash
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate reset --force
```

---

## 11. Troubleshooting

| Symptom | First thing to check |
|---------|----------------------|
| Caddy returns 502 on /api | `docker compose logs api` — usually DB unreachable. Re-check `DATABASE_URL` matches `DB_PASSWORD`. |
| Caddy returns 502 on / (web) | `docker compose logs web`. Look for missing `NEXT_PUBLIC_API_URL` at build time — must be set during `docker compose build`. |
| `Could not obtain TLS cert` in Caddy logs | DNS A record is not yet pointing to the VPS, or ports 80/443 are blocked. Check `ufw status` and `dig +short <DOMAIN>`. |
| Extraction returns "API error" | `docker compose logs ai-engine`. Almost always `OPENAI_API_KEY` empty / wrong / out of quota. |
| AI engine container OOMKilled | Check `docker stats`. Usually a very large PDF. Increase `mem_limit` in compose or upgrade VPS. |
| Postgres won't start | First boot fails if `DB_PASSWORD` was changed *after* the pgdata volume was created. Either restore the old password or `docker compose down -v` (wipes data!). |
| `Cannot allocate memory` during build | Activate swap: `sudo swapon /swapfile` (the bootstrap script already does this). |
| 413 Payload Too Large on upload | Caddy default is 32 MB; uncomment `request_body { max_size 100MB }` in the Caddyfile. |

### Where to look for things
- Caddy access log: `docker compose exec caddy cat /var/log/caddy/access.log`
- Container shells: `docker compose exec <service> sh`
- MinIO console (via SSH tunnel): `ssh -L 9001:localhost:9001 brsr@VPS_IP` then visit http://localhost:9001 — MinIO is intentionally not exposed publicly.

---

## 12. When to scale off this VPS

You will need to move off a single-VPS topology when **any** of these
become true:

- Tenants > ~100 active, or extraction jobs/min > 5 sustained
- Postgres dataset > 50 GB
- You need 99.9%+ SLA (single VPS = no redundancy)
- You need region-failover or PII data-residency separation

Migration checklist to AWS (or equivalent):

1. **Managed Postgres**: AWS RDS (or Aurora) — restore from the latest
   `pg_dump` in MinIO. Update `DATABASE_URL`.
2. **Managed Redis**: AWS ElastiCache. Update `REDIS_URL`.
3. **Object store**: AWS S3 — `mc mirror local/brsr-evidence s3/brsr-evidence-prod`. Point `S3_ENDPOINT` to the real S3 URL.
4. **Vector store**: Qdrant Cloud or self-host Qdrant on EKS.
5. **Compute**: containerise the same images into EKS (manifests live in `infra/k8s/`).
6. **Edge**: CloudFront in front of an ALB. Keep Caddy or move to an ALB
   listener with ACM cert.
7. **Backups**: switch to RDS automated backups + S3 lifecycle policies.

The Docker images and `.env` shape do not need to change — only the URL
endpoints in `.env`.
