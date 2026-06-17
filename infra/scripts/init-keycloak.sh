#!/usr/bin/env bash
# Bootstrap the Keycloak 'brsr' realm with the brsr-web client and seed users.
# Intended for local dev. The realm import in docker-compose handles most of
# this; this script tops it up with demo users if they are missing.

set -euo pipefail

KC_URL="${KC_URL:-http://localhost:8080}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
REALM="brsr"
CLIENT_ID="brsr-web"

log()  { printf '[init-keycloak] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

# Wait for Keycloak readiness
log "Waiting for Keycloak at ${KC_URL} ..."
for _ in $(seq 1 60); do
  if curl -fsS "${KC_URL}/health/ready" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "${KC_URL}/health/ready" >/dev/null 2>&1 || fail "Keycloak did not become ready"

# Login as admin
log "Authenticating as ${KC_ADMIN_USER} ..."
TOKEN=$(curl -fsS \
  -d "client_id=admin-cli" \
  -d "username=${KC_ADMIN_USER}" \
  -d "password=${KC_ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  "${KC_URL}/realms/master/protocol/openid-connect/token" | jq -r '.access_token')
[ -n "${TOKEN}" ] && [ "${TOKEN}" != "null" ] || fail "could not obtain admin token"

api() { curl -fsS -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" "$@"; }

# Ensure realm exists
if ! api "${KC_URL}/admin/realms/${REALM}" >/dev/null 2>&1; then
  log "Creating realm ${REALM} ..."
  api -X POST "${KC_URL}/admin/realms" -d "{\"realm\":\"${REALM}\",\"enabled\":true,\"sslRequired\":\"external\"}"
fi

# Ensure brsr-web client exists
CLIENT_UUID=$(api "${KC_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" | jq -r '.[0].id // empty')
if [ -z "${CLIENT_UUID}" ]; then
  log "Creating client ${CLIENT_ID} ..."
  CLIENT_PAYLOAD=$(cat <<JSON
{
  "clientId": "${CLIENT_ID}",
  "publicClient": false,
  "protocol": "openid-connect",
  "redirectUris": ["http://localhost:3000/*","http://localhost:3001/*"],
  "webOrigins": ["http://localhost:3000","http://localhost:3001"],
  "directAccessGrantsEnabled": true,
  "standardFlowEnabled": true,
  "serviceAccountsEnabled": true,
  "attributes": { "pkce.code.challenge.method": "S256" }
}
JSON
  )
  api -X POST "${KC_URL}/admin/realms/${REALM}/clients" -d "${CLIENT_PAYLOAD}"
  CLIENT_UUID=$(api "${KC_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" | jq -r '.[0].id')
fi

# Roles
for role in TenantAdmin SustainabilityManager Reviewer Approver Auditor SupplierUser BoardMember ReadOnly; do
  if ! api "${KC_URL}/admin/realms/${REALM}/roles/${role}" >/dev/null 2>&1; then
    log "Creating role ${role} ..."
    api -X POST "${KC_URL}/admin/realms/${REALM}/roles" -d "{\"name\":\"${role}\"}"
  fi
done

# Demo users
seed_user() {
  local username="$1"; local role="$2"; local password="$3"; local email="$4"
  local existing
  existing=$(api "${KC_URL}/admin/realms/${REALM}/users?username=${username}" | jq -r '.[0].id // empty')
  if [ -z "${existing}" ]; then
    log "Creating user ${username} ..."
    api -X POST "${KC_URL}/admin/realms/${REALM}/users" -d "{
      \"username\":\"${username}\",
      \"email\":\"${email}\",
      \"enabled\":true,
      \"emailVerified\":true,
      \"credentials\":[{\"type\":\"password\",\"value\":\"${password}\",\"temporary\":false}]
    }"
    existing=$(api "${KC_URL}/admin/realms/${REALM}/users?username=${username}" | jq -r '.[0].id')
  fi
  local role_obj
  role_obj=$(api "${KC_URL}/admin/realms/${REALM}/roles/${role}")
  api -X POST "${KC_URL}/admin/realms/${REALM}/users/${existing}/role-mappings/realm" -d "[${role_obj}]"
}

seed_user "demo"            "TenantAdmin"           "demo"     "demo@acmesteel.in"
seed_user "sustain.manager" "SustainabilityManager" "demo"     "sustain@acmesteel.in"
seed_user "reviewer"        "Reviewer"              "demo"     "reviewer@acmesteel.in"
seed_user "auditor"         "Auditor"               "demo"     "auditor@bigfour.example"
seed_user "supplier"        "SupplierUser"          "demo"     "supplier@vendor.example"

log "Done. Try logging in at ${KC_URL}/realms/${REALM}/account"
