#!/usr/bin/env bash
# bundle-debug.sh — produce a clean, debuggable archive of the codebase.
# Excludes: node_modules, build artifacts, screenshots, secrets.

set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d)
OUT="brsr-platform-debug-${VERSION}.tar.gz"

echo "Bundling brsr-v2 → $OUT"

tar --exclude='**/node_modules' \
    --exclude='**/.next' \
    --exclude='**/dist' \
    --exclude='**/__pycache__' \
    --exclude='**/.pytest_cache' \
    --exclude='**/.venv' \
    --exclude='**/.cache' \
    --exclude='**/.turbo' \
    --exclude='**/.parcel-cache' \
    --exclude='**/coverage' \
    --exclude='qa-ui-test/shots*' \
    --exclude='qa-ui-test/*.json' \
    --exclude='qa-ui-test/node_modules' \
    --exclude='qa-ui-test/*.csv' \
    --exclude='qa-ui-test/*.pdf' \
    --exclude='services/ai-engine/tests/benchmark/fixtures-rc' \
    --exclude='services/ai-engine/tests/benchmark/benchmark_results.json' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='**/.DS_Store' \
    --exclude='*.tar.gz' \
    --exclude='*.zip' \
    -czf "$OUT" \
    DEBUG.md \
    README.md \
    LICENSE \
    .env.example \
    docker-compose.prod.yml \
    package.json \
    pnpm-workspace.yaml \
    pnpm-lock.yaml \
    turbo.json \
    tsconfig.base.json \
    infra/ \
    services/ \
    apps/ \
    packages/ \
    docs/ \
    scripts/ \
    qa-ui-test/walkthrough.js \
    qa-ui-test/deep-scan.js \
    qa-ui-test/audit-end-to-end.js \
    qa-ui-test/rc-full-journey.js \
    qa-ui-test/package.json \
    2>/dev/null || true

SIZE=$(du -h "$OUT" | cut -f1)
COUNT=$(tar -tzf "$OUT" | wc -l)
echo "Archive: $OUT  ($SIZE, $COUNT files)"
echo ""
echo "To restore:"
echo "  mkdir -p brsr-debug && tar -xzf $OUT -C brsr-debug"
echo "  cd brsr-debug && cp .env.example .env  # then fill in secrets"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
echo "  open DEBUG.md  # start here"
