#!/usr/bin/env bash
# pg_dump the BRSR Postgres database and upload to MinIO/S3 (locally),
# or to S3 (in prod) with KMS-encrypted SSE.

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-brsr}"
DB_NAME="${DB_NAME:-brsr_dev}"
PGPASSWORD="${PGPASSWORD:-brsr}"
export PGPASSWORD

OUT_DIR="${OUT_DIR:-./backups}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
FILE="${OUT_DIR}/brsr-${DB_NAME}-${TS}.sql.gz"

# Storage target: local MinIO by default; override S3_BUCKET in prod
S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:9000}"
S3_BUCKET="${S3_BUCKET:-brsr-backups}"
S3_PREFIX="${S3_PREFIX:-postgres}"
S3_PROFILE="${S3_PROFILE:-}"

mkdir -p "${OUT_DIR}"

echo "[backup-db] dumping ${DB_NAME} from ${DB_HOST}:${DB_PORT} ..."
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
  --format=plain --no-owner --no-acl \
  "${DB_NAME}" | gzip -9 > "${FILE}"

SIZE=$(du -h "${FILE}" | cut -f1)
SHA=$(sha256sum "${FILE}" | cut -d' ' -f1)
echo "[backup-db] wrote ${FILE} (${SIZE}, sha256=${SHA})"

if [ -n "${S3_BUCKET}" ]; then
  if [ "${S3_ENDPOINT}" = "http://localhost:9000" ]; then
    echo "[backup-db] uploading to local MinIO ${S3_BUCKET}/${S3_PREFIX}"
    AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
      aws --endpoint-url "${S3_ENDPOINT}" s3 cp "${FILE}" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "${FILE}")"
  else
    echo "[backup-db] uploading to S3 ${S3_BUCKET}/${S3_PREFIX} (KMS SSE)"
    aws ${S3_PROFILE:+--profile $S3_PROFILE} s3 cp "${FILE}" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "${FILE}")" \
      --sse aws:kms --metadata "sha256=${SHA}"
  fi
fi

echo "[backup-db] done."
