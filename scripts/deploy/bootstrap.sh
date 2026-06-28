#!/usr/bin/env bash
# One-time bootstrap after `docker compose -f docker-compose.deploy.yml up -d --build`.
# Seeds the tenant, sets a local password on the admin (zip1 seeds Keycloak-only
# users), and grants GROUP_ADMIN every route permission (login token carries no
# roles, so the guard uses the DB permission union). Run from the repo root.
#
#   bash scripts/deploy/bootstrap.sh [admin_email] [admin_password]
set -euo pipefail
C="docker compose -f docker-compose.deploy.yml"
EMAIL="${1:-group.admin@imaginepowertree.example}"
PW="${2:-Admin@1234}"

echo "→ seeding ontology + tenant ..."
$C exec -T api sh -c "node_modules/.bin/ts-node --transpile-only -r tsconfig-paths/register prisma/seed.ts" \
  || $C exec -T api sh -c "npx --yes tsx prisma/seed.ts"

echo "→ setting local password for $EMAIL ..."
HASH=$($C exec -T api node -e "process.stdout.write(require('bcrypt').hashSync(process.argv[1],12))" "$PW")
$C exec -T postgres psql -U brsr -d brsr -c \
  "UPDATE \"user\" SET password_hash='$HASH' WHERE email='$EMAIL';"

echo "→ granting GROUP_ADMIN all route permissions ..."
PERMS=$(grep -rhoE "@RequirePermissions\([^)]*\)" services/api/src \
  | grep -oE "'[a-zA-Z0-9_.:-]+'" | tr -d "'" | sort -u | paste -sd, -)
$C exec -T postgres psql -U brsr -d brsr -c \
  "UPDATE role SET permissions='{$PERMS}' WHERE name='GROUP_ADMIN';"

echo "✓ bootstrap complete — login: $EMAIL / $PW"
