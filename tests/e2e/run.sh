#!/usr/bin/env bash
# Entry point for the BRSR v2 E2E harness.
#
# Usage:
#   ./run.sh                # full suite against prod
#   ./run.sh smoke          # smoke subset only
#   E2E_API_BASE_URL=http://localhost:4000/api/v1/v1 ./run.sh
#   E2E_INSECURE=1 ./run.sh # skip TLS verification (self-signed VPS certs)
set -euo pipefail

cd "$(dirname "$0")"

BASE_URL="${E2E_API_BASE_URL:-https://srv1763596.hstgr.cloud/api/v1/v1}"

echo "BRSR E2E harness"
echo "  base URL: $BASE_URL"

# Prereq: node + npm
command -v node >/dev/null 2>&1 || { echo "ERROR: node not installed"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "ERROR: npm not installed"; exit 1; }

# Prereq: deps installed
if [ ! -d "node_modules/axios" ] || [ ! -d "node_modules/form-data" ]; then
  echo "Installing dependencies…"
  npm install --no-audit --no-fund
fi

# Prereq: API reachable (root host of the URL)
ROOT_HOST="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.origin)" "$BASE_URL")"
echo "  pre-check: $ROOT_HOST/health"
if ! curl -fks --max-time 10 "$ROOT_HOST/health" > /dev/null 2>&1; then
  echo "WARNING: $ROOT_HOST/health unreachable — running tests anyway, they will report HTTP 0/timeouts."
fi

case "${1:-all}" in
  smoke)
    node scripts/run-all.js --suite=smoke
    ;;
  all|*)
    node scripts/run-all.js
    ;;
esac
