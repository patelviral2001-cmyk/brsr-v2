#!/usr/bin/env bash
# Bootstrap MinIO buckets, versioning, retention defaults and lifecycle.
# Idempotent. Safe to run repeatedly.

set -euo pipefail

MC="${MC:-mc}"
MINIO_ALIAS="${MINIO_ALIAS:-local}"
MINIO_URL="${MINIO_URL:-http://localhost:9000}"
MINIO_USER="${MINIO_USER:-minioadmin}"
MINIO_PASSWORD="${MINIO_PASSWORD:-minioadmin}"

BUCKETS=(brsr-dev brsr-evidence brsr-reports brsr-extracts brsr-backups brsr-audit-chain)

log() { printf '[init-minio] %s\n' "$*" >&2; }

if ! command -v "${MC}" >/dev/null 2>&1; then
  log "mc not installed; falling back to docker run minio/mc"
  MC="docker run --rm --network host minio/mc:latest"
fi

log "Waiting for MinIO at ${MINIO_URL} ..."
for _ in $(seq 1 60); do
  if curl -fsS "${MINIO_URL}/minio/health/live" >/dev/null 2>&1; then break; fi
  sleep 2
done

log "Setting alias ${MINIO_ALIAS} -> ${MINIO_URL}"
${MC} alias set "${MINIO_ALIAS}" "${MINIO_URL}" "${MINIO_USER}" "${MINIO_PASSWORD}" >/dev/null

for b in "${BUCKETS[@]}"; do
  log "Ensuring bucket ${b}"
  ${MC} mb --ignore-existing "${MINIO_ALIAS}/${b}"
done

log "Enabling versioning on evidence/reports/audit-chain"
${MC} version enable "${MINIO_ALIAS}/brsr-evidence"
${MC} version enable "${MINIO_ALIAS}/brsr-reports"
${MC} version enable "${MINIO_ALIAS}/brsr-audit-chain"

log "Setting Object Lock retention defaults (best-effort; dev MinIO may not support compliance mode)"
${MC} retention set --default compliance 10y "${MINIO_ALIAS}/brsr-evidence" || true
${MC} retention set --default governance 7y  "${MINIO_ALIAS}/brsr-reports"   || true
${MC} retention set --default compliance 10y "${MINIO_ALIAS}/brsr-audit-chain" || true

log "Applying ILM (lifecycle) policies"
cat > /tmp/ilm-evidence.json <<'JSON'
{
  "Rules": [
    {
      "ID": "transition-IA",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Transition": { "Days": 90, "StorageClass": "STANDARD_IA" }
    }
  ]
}
JSON
${MC} ilm import "${MINIO_ALIAS}/brsr-evidence" < /tmp/ilm-evidence.json || true

log "Applying bucket policies (deny insecure PUT for evidence)"
cat > /tmp/policy-evidence.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecure",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::brsr-evidence","arn:aws:s3:::brsr-evidence/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
JSON
${MC} anonymous set-json /tmp/policy-evidence.json "${MINIO_ALIAS}/brsr-evidence" || true

log "Done."
