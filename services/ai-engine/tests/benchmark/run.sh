#!/usr/bin/env bash
# Single command to generate fixtures, run the benchmark and produce the
# markdown report. Use from the service root:
#
#   bash tests/benchmark/run.sh
#
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "[1/3] Generating fixtures (idempotent)..."
python -m tests.benchmark.generate_fixtures

echo "[2/3] Running benchmark..."
python -m tests.benchmark.runner

echo "[3/3] Writing markdown report..."
python -m tests.benchmark.report

echo "Done."
echo "Results:  tests/benchmark/benchmark_results.json"
echo "Report:   tests/benchmark/REPORT.md"
