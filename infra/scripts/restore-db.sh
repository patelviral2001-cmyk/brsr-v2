#!/usr/bin/env bash
# Restore a BRSR Postgres database from a gzip'd pg_dump.
# DESTRUCTIVE: drops the target DB. Asks for confirmation unless -y is passed.

set -euo pipefail

usage() { echo "Usage: $0 [-y] <backup.sql.gz>"; exit 1; }

YES=0
if [ "${1:-}" = "-y" ]; then YES=1; shift; fi
FILE="${1:-}"
[ -n "${FILE}" ] || usage
[ -f "${FILE}" ] || { echo "no such file: ${FILE}"; exit 2; }

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-brsr}"
DB_NAME="${DB_NAME:-brsr_dev}"
PGPASSWORD="${PGPASSWORD:-brsr}"
export PGPASSWORD

if [ ${YES} -ne 1 ]; then
  read -r -p "About to DROP and recreate ${DB_NAME} on ${DB_HOST}:${DB_PORT}. Continue? (yes/N) " ans
  [ "${ans}" = "yes" ] || { echo "aborted"; exit 1; }
fi

echo "[restore-db] dropping and recreating ${DB_NAME}"
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "CREATE DATABASE \"${DB_NAME}\";"

echo "[restore-db] restoring ${FILE}"
gunzip -c "${FILE}" | psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1

echo "[restore-db] done."
