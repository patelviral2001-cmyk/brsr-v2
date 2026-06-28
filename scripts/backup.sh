#!/usr/bin/env bash
# =====================================================================
# BRSR AI Platform v2 -- Backup script
# - Dumps Postgres
# - Uploads dump to MinIO bucket `brsr-backups`
# - Retains last 7 daily dumps (older are deleted)
#
# Cron example (run as the brsr user):
#   0 2 * * *  /home/brsr/brsr-v2/scripts/backup.sh >> /var/log/brsr-backup.log 2>&1
# =====================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.prod.yml"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

log()  { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || fail ".env not found"
# shellcheck disable=SC1091
set -a; source .env; set +a

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="brsr-pg-${TS}.sql.gz"
LOCAL_DIR="${REPO_ROOT}/data/backups"
LOCAL_PATH="${LOCAL_DIR}/${DUMP_NAME}"

mkdir -p "$LOCAL_DIR"

# --- 1. pg_dump from inside the postgres container ------------------
log "Dumping Postgres -> ${DUMP_NAME}"
$COMPOSE exec -T postgres \
  pg_dump -U "${DB_USER}" -d brsr --no-owner --no-privileges --clean --if-exists \
  | gzip -9 > "${LOCAL_PATH}"

SIZE=$(du -h "$LOCAL_PATH" | cut -f1)
log "Dump complete: ${LOCAL_PATH} (${SIZE})"

# --- 2. Upload to MinIO ---------------------------------------------
log "Uploading to MinIO bucket brsr-backups"
$COMPOSE run --rm \
  -v "${LOCAL_DIR}:/backups:ro" \
  --entrypoint /bin/sh \
  minio-init -c "
    set -e
    mc alias set local http://minio:9000 \"${MINIO_ROOT_USER}\" \"${MINIO_ROOT_PASSWORD}\"
    mc mb local/brsr-backups >/dev/null 2>&1 || true
    mc cp '/backups/${DUMP_NAME}' 'local/brsr-backups/postgres/${DUMP_NAME}'
  "

# --- 3. Local retention ---------------------------------------------
log "Pruning local backups older than ${RETENTION_DAYS} days"
find "$LOCAL_DIR" -type f -name 'brsr-pg-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

# --- 4. Remote retention (MinIO) ------------------------------------
log "Pruning MinIO backups older than ${RETENTION_DAYS} days"
$COMPOSE run --rm \
  --entrypoint /bin/sh \
  minio-init -c "
    set -e
    mc alias set local http://minio:9000 \"${MINIO_ROOT_USER}\" \"${MINIO_ROOT_PASSWORD}\"
    mc ilm rule add --expire-days ${RETENTION_DAYS} local/brsr-backups >/dev/null 2>&1 || true
    # Also do an explicit sweep in case ILM not yet effective
    mc find local/brsr-backups/postgres --older-than ${RETENTION_DAYS}d --exec 'mc rm {}' || true
  "

log "Backup complete: ${DUMP_NAME}"
