#!/usr/bin/env bash
# Bootstrap a Langfuse project for local dev. Creates an organization, a
# project, and an API key pair, then writes them to .env.local.langfuse for
# the ai-engine and copilot to consume.

set -euo pipefail

LF_URL="${LF_URL:-http://localhost:3100}"
LF_EMAIL="${LF_EMAIL:-platform@brsrai.local}"
LF_PASSWORD="${LF_PASSWORD:-LangfuseDev_2026!}"
LF_USER_NAME="${LF_USER_NAME:-BRSR Platform}"
PROJECT_NAME="${PROJECT_NAME:-brsr-dev}"
ORG_NAME="${ORG_NAME:-brsr}"

log() { printf '[seed-langfuse] %s\n' "$*" >&2; }

# Wait for Langfuse
log "Waiting for Langfuse at ${LF_URL} ..."
for _ in $(seq 1 60); do
  if curl -fsS "${LF_URL}/api/public/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "${LF_URL}/api/public/health" >/dev/null 2>&1 || { log "Langfuse not ready"; exit 1; }

# Sign up (no-op if user exists)
log "Ensuring user ${LF_EMAIL}"
curl -fsS -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"${LF_USER_NAME}\",\"email\":\"${LF_EMAIL}\",\"password\":\"${LF_PASSWORD}\"}" \
  "${LF_URL}/api/auth/sign-up" >/dev/null 2>&1 || true

# Login -> get session cookie
COOKIE_JAR=$(mktemp)
curl -fsS -c "${COOKIE_JAR}" -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"${LF_EMAIL}\",\"password\":\"${LF_PASSWORD}\"}" \
  "${LF_URL}/api/auth/callback/credentials?json=true" >/dev/null

log "Creating organization ${ORG_NAME}"
ORG=$(curl -fsS -b "${COOKIE_JAR}" -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"${ORG_NAME}\"}" "${LF_URL}/api/admin/organisations" || true)
ORG_ID=$(printf '%s' "$ORG" | jq -r '.id // empty')

log "Creating project ${PROJECT_NAME}"
PROJECT=$(curl -fsS -b "${COOKIE_JAR}" -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"${PROJECT_NAME}\",\"organisationId\":\"${ORG_ID}\"}" \
  "${LF_URL}/api/admin/projects")
PROJECT_ID=$(printf '%s' "$PROJECT" | jq -r '.id // empty')

log "Issuing API keys"
KEYS=$(curl -fsS -b "${COOKIE_JAR}" -X POST -H "Content-Type: application/json" \
  -d "{\"projectId\":\"${PROJECT_ID}\",\"note\":\"dev-bootstrap\"}" \
  "${LF_URL}/api/admin/apiKeys")

PUBLIC=$(printf '%s' "$KEYS" | jq -r '.publicKey')
SECRET=$(printf '%s' "$KEYS" | jq -r '.secretKey')

ENV_FILE="${ENV_FILE:-.env.local.langfuse}"
cat > "${ENV_FILE}" <<EOF
LANGFUSE_PUBLIC_KEY=${PUBLIC}
LANGFUSE_SECRET_KEY=${SECRET}
LANGFUSE_HOST=${LF_URL}
EOF

log "Wrote ${ENV_FILE}. Source it from apps/ai-engine and apps/copilot."
rm -f "${COOKIE_JAR}"
