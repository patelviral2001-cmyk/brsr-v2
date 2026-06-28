# Deploy brsr-uedi to a VPS (Docker, IP-only HTTP)

Trimmed single-VPS stack with UEDI extraction: **postgres + redis + minio +
ai-engine(UEDI) + api + web**. No Keycloak/Qdrant/Kafka/Caddy. Public over the
VPS IP on HTTP (`:3000` web, `:4000` api). Add a domain + TLS later.

## 0. Before you start — rotate secrets
The OpenAI key and the GCP service-account key from development are **compromised**
(they were shared in chat). Create fresh ones:
- OpenAI: revoke old, create new key.
- GCP: delete the old SA key, download a fresh `ocr-sa.json`.

## 1. Provision the VPS (Ubuntu)
```bash
# as root
apt-get update && apt-get install -y docker.io docker-compose-plugin git
systemctl enable --now docker
# open the ports (or via Hostinger firewall): 3000, 4000
ufw allow 3000/tcp && ufw allow 4000/tcp || true
```

## 2. Get the code
```bash
git clone <YOUR_GIT_REMOTE> brsr-uedi && cd brsr-uedi
```

## 3. Configure
```bash
cp .env.deploy.example .env
nano .env            # set VPS_IP + all REPLACE_* secrets (rotated keys)
mkdir -p secrets
# upload the ROTATED service-account JSON to ./secrets/ocr-sa.json
```
`VPS_IP` is baked into the web build (Next.js inlines `NEXT_PUBLIC_*`), so it must
be set before the build in step 4. Use the VPS public IP.

## 4. Build & start
```bash
docker compose -f docker-compose.deploy.yml --env-file .env up -d --build
docker compose -f docker-compose.deploy.yml ps         # all healthy?
```
The api auto-runs `prisma migrate deploy` on boot (`RUN_MIGRATIONS=true`).

## 5. Bootstrap (seed + admin login + permissions)
```bash
bash scripts/deploy/bootstrap.sh group.admin@imaginepowertree.example 'YourStrongPw'
```
This seeds the tenant, sets a local password (zip1 seeds Keycloak-only users with
no password), and grants GROUP_ADMIN every route permission.

## 6. Use it
- Web: `http://<VPS_IP>:3000`  → log in with the admin email/password above.
- Upload a bill (Files) → UEDI extracts via Document AI/GPT-4o → review screen.
- API health: `http://<VPS_IP>:4000/v1/health` (expect db/s3/ai true).

## Notes & caveats
- **Builds are untested locally** (no Docker on the dev box) — first real build is
  on the VPS; expect to iterate on the monorepo Docker builds.
- Redis is included (queues). Keycloak/OPA are stubbed/disabled — auth is the
  api's local HS256 login, which is why bootstrap sets a password.
- To update: `git pull && docker compose -f docker-compose.deploy.yml up -d --build`.
- Harden later: domain + Caddy TLS, restrict CORS, firewall, backups of the
  `pgdata`/`miniodata` volumes.
- Known polish carried over: extraction fields can duplicate; some native-path
  fields show Hindi-label bleed — all flagged to review.
