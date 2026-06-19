#!/usr/bin/env bash
# =====================================================================
# BRSR AI Platform v2 -- Production deploy script
# Idempotent: safe to re-run after each `git pull`.
#
# Usage:
#   ./scripts/deploy.sh                              # routine update
#   FRESH_DB=true SEED_DB=true ./scripts/deploy.sh   # destructive reset + reseed
#   SEED_DB=true ./scripts/deploy.sh                 # first deploy (seed demo data)
#   SKIP_BUILD=true ./scripts/deploy.sh              # restart without rebuilding
# =====================================================================
set -euo pipefail

# --- locate repo root regardless of cwd ------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.prod.yml"

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n'  "$*"; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n'  "$*" >&2; exit 1; }

# --- 1. Sanity checks ------------------------------------------------
log "Repo: $REPO_ROOT"

command -v docker >/dev/null  || fail "docker not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 plugin missing"

if [[ ! -f .env ]]; then
  fail ".env not found. Run:  cp .env.production.example .env  && nano .env"
fi

# Verify required env vars exist (without printing them).
required_vars=(DOMAIN DB_PASSWORD JWT_SECRET NEXTAUTH_SECRET \
               INTERNAL_CALLBACK_SECRET MINIO_ROOT_PASSWORD OPENAI_API_KEY)
missing=()
# shellcheck disable=SC1091
set -a; source .env; set +a
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done
if (( ${#missing[@]} > 0 )); then
  fail "Missing env vars in .env: ${missing[*]}"
fi

# --- 2. Pull latest source (skip if not a git repo) ------------------
if [[ -d .git ]]; then
  log "git pull"
  git pull --ff-only || warn "git pull failed; continuing with local source"
else
  warn "Not a git checkout; skipping git pull"
fi

# --- 3. Build images -------------------------------------------------
if [[ "${SKIP_BUILD:-false}" != "true" ]]; then
  log "Building images (api, ai-engine, web)..."
  $COMPOSE build --pull
else
  log "SKIP_BUILD=true -> not rebuilding"
fi

# --- 4. Start infrastructure tier -----------------------------------
log "Starting infrastructure: postgres, redis, minio"
$COMPOSE up -d postgres redis minio

log "Waiting for infrastructure healthy..."
for svc in postgres redis minio; do
  for i in {1..30}; do
    state=$($COMPOSE ps --format json "$svc" 2>/dev/null | \
            grep -oE '"Health":"[a-z]+"' | head -1 | cut -d'"' -f4 || echo "")
    if [[ "$state" == "healthy" ]]; then
      log "  $svc: healthy"
      break
    fi
    sleep 2
    if (( i == 30 )); then
      warn "$svc never became healthy; check logs:  $COMPOSE logs $svc"
    fi
  done
done

# --- 5. Initialise MinIO buckets ------------------------------------
log "Initialising MinIO buckets (idempotent)"
$COMPOSE run --rm minio-init

# --- 6. Apply database schema ---------------------------------------
# FRESH_DB=true       -> destructively reset DB and push current schema (first deploy / Phase 0+1 cutover)
# (default)           -> prisma migrate deploy (requires checked-in migrations)
if [[ "${FRESH_DB:-false}" == "true" ]]; then
  warn "FRESH_DB=true -> destructively resetting DB and pushing schema (all data wiped)"
  $COMPOSE run --rm \
    -e RUN_MIGRATIONS=false \
    api npx prisma db push --accept-data-loss --force-reset --skip-generate
else
  log "Running Prisma migrations"
  $COMPOSE run --rm \
    -e RUN_MIGRATIONS=false \
    api npx prisma migrate deploy
fi

# --- 7. Optional seed (first deploy only) ---------------------------
if [[ "${SEED_DB:-false}" == "true" ]]; then
  log "SEED_DB=true -> running prisma seed"
  $COMPOSE run --rm api npm run prisma:seed || warn "Seed failed (already seeded?)"
fi

# --- 8. Start application tier --------------------------------------
log "Starting application: ai-engine, api, web, caddy"
$COMPOSE up -d ai-engine api web caddy

# --- 9. Status report ------------------------------------------------
log "Waiting for app healthchecks (~30s)..."
sleep 25
$COMPOSE ps

cat <<EOF

------------------------------------------------------------
  Deployment complete.

  URL:    https://${DOMAIN}
  Logs:   docker compose -f docker-compose.prod.yml logs -f <service>
  Status: docker compose -f docker-compose.prod.yml ps
------------------------------------------------------------
EOF
