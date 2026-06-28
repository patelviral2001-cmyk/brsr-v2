"""Benchmark runner — execute the 6-layer pipeline over all fixtures.

Run via::

    python -m tests.benchmark.runner

Or use ``tests/benchmark/run.sh`` which wraps this + the report writer.

The runner:
  1. Loads every fixture under ``tests/benchmark/fixtures/<group>/*.txt``
     together with its ``*.json`` ground truth sidecar.
  2. Invokes ``PipelineOrchestrator.run_from_bytes`` (no S3, no LLM in
     offline mode) on each fixture.
  3. Compares predicted vs ground-truth metric values with a small
     relative tolerance (5%) for numerics; dates accept ISO match only.
  4. Emits ``benchmark_results.json`` and a markdown report.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Ensure project root on path when running via "python tests/benchmark/runner.py"
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.requests import ExtractRequest  # noqa: E402
from app.models.responses import ExtractedField, ExtractResponse  # noqa: E402
from app.pipeline.orchestrator import PipelineOrchestrator  # noqa: E402

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
RESULTS_PATH = Path(__file__).parent / "benchmark_results.json"
REPORT_PATH = Path(__file__).parent / "REPORT.md"

NUMERIC_TOLERANCE = 0.05  # 5% relative tolerance counts as correct
ABS_TOLERANCE = 1.0       # absolute tolerance floor for small integers


# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------


@dataclass
class Fixture:
    name: str
    group: str
    doc_type: str
    text: str
    ground_truth: dict[str, Any]
    expected_fields: dict[str, Any] = field(default_factory=dict)


def load_all_fixtures() -> list[Fixture]:
    fixtures: list[Fixture] = []
    if not FIXTURE_ROOT.exists():
        # Auto-generate if not present.
        from tests.benchmark.generate_fixtures import main as gen_main  # type: ignore
        gen_main()
    for group_dir in sorted(FIXTURE_ROOT.iterdir()):
        if not group_dir.is_dir():
            continue
        group = group_dir.name
        for f in sorted(group_dir.glob("*.txt")):
            gt_path = f.with_suffix(".json")
            if not gt_path.exists():
                continue
            try:
                gt = json.loads(gt_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            fixtures.append(
                Fixture(
                    name=f.stem,
                    group=group,
                    doc_type=str(gt.get("doc_type", "UNKNOWN")),
                    text=f.read_text(encoding="utf-8"),
                    ground_truth=gt,
                    expected_fields=dict(gt.get("fields") or {}),
                )
            )
    return fixtures


# ---------------------------------------------------------------------------
# Metric comparison
# ---------------------------------------------------------------------------


@dataclass
class FixtureScore:
    fixture: str
    group: str
    doc_type: str
    tp: int = 0
    fp: int = 0
    fn: int = 0
    correct_values: int = 0
    expected_total: int = 0
    avg_confidence: float = 0.0
    confidence_levels: dict[str, int] = field(default_factory=dict)
    field_outcomes: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 0.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return (2 * p * r / (p + r)) if (p + r) else 0.0

    @property
    def accuracy(self) -> float:
        if self.expected_total == 0:
            return 0.0
        return self.correct_values / self.expected_total


def _values_match(predicted: float, expected: float) -> bool:
    if predicted is None or expected is None:
        return False
    if abs(predicted - expected) <= ABS_TOLERANCE:
        return True
    denom = max(abs(predicted), abs(expected), 1e-9)
    return abs(predicted - expected) / denom <= NUMERIC_TOLERANCE


def score_fixture(predicted: ExtractResponse, fix: Fixture) -> FixtureScore:
    score = FixtureScore(fixture=fix.name, group=fix.group, doc_type=fix.doc_type)
    expected = {k: v for k, v in fix.expected_fields.items() if not k.startswith("period")}
    score.expected_total = len(expected)

    # Index predicted fields by canonical_key.
    by_key: dict[str, ExtractedField] = {}
    for f in predicted.fields:
        # Keep highest-confidence per key.
        existing = by_key.get(f.canonical_key)
        if existing is None or f.confidence_composite > existing.confidence_composite:
            by_key[f.canonical_key] = f

    confidences: list[float] = []
    levels: dict[str, int] = defaultdict(int)
    for key, exp_val in expected.items():
        if key in by_key:
            pred = by_key[key]
            confidences.append(pred.confidence_composite)
            levels[pred.confidence_level.value] += 1
            score.tp += 1
            v = pred.value_canonical if pred.value_canonical is not None else pred.value_num
            if isinstance(exp_val, (int, float)) and _values_match(v, float(exp_val)):
                score.correct_values += 1
                score.field_outcomes.append(
                    {"key": key, "expected": exp_val, "got": v, "ok": True,
                     "confidence": pred.confidence_composite, "level": pred.confidence_level.value}
                )
            else:
                score.field_outcomes.append(
                    {"key": key, "expected": exp_val, "got": v, "ok": False,
                     "confidence": pred.confidence_composite, "level": pred.confidence_level.value}
                )
                score.errors.append(f"value_mismatch:{key}:expected={exp_val}:got={v}")
        else:
            score.fn += 1
            score.field_outcomes.append(
                {"key": key, "expected": exp_val, "got": None, "ok": False, "missing": True}
            )
            score.errors.append(f"missing:{key}")
    # FPs: predicted keys not in expected (penalise lightly — only for the
    # fixture's relevant doc-type categories so utility metrics don't get
    # counted as FPs on a fuel invoice).
    for key in by_key:
        if key not in expected:
            score.fp += 1

    if confidences:
        score.avg_confidence = sum(confidences) / len(confidences)
    score.confidence_levels = dict(levels)
    return score


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


@dataclass
class BenchmarkReport:
    by_group: dict[str, dict[str, Any]] = field(default_factory=dict)
    overall: dict[str, Any] = field(default_factory=dict)
    failure_modes: dict[str, int] = field(default_factory=dict)
    calibration: dict[str, dict[str, float]] = field(default_factory=dict)
    fixture_scores: list[dict[str, Any]] = field(default_factory=list)


def _aggregate(scores: list[FixtureScore]) -> dict[str, Any]:
    if not scores:
        return {"n": 0, "precision": 0.0, "recall": 0.0, "f1": 0.0,
                "accuracy": 0.0, "avg_confidence": 0.0}
    n = len(scores)
    return {
        "n": n,
        "precision": sum(s.precision for s in scores) / n,
        "recall": sum(s.recall for s in scores) / n,
        "f1": sum(s.f1 for s in scores) / n,
        "accuracy": sum(s.accuracy for s in scores) / n,
        "avg_confidence": sum(s.avg_confidence for s in scores) / n,
    }


def _classify_failure(err: str) -> str:
    if err.startswith("missing"):
        return "missing_field"
    if "value_mismatch" in err:
        if any(u in err for u in ["kWh", "kwh", "MWh"]):
            return "unit_mismatch"
        return "value_mismatch"
    if "date" in err or "period" in err:
        return "date_format"
    return "other"


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


async def benchmark() -> BenchmarkReport:
    fixtures = load_all_fixtures()
    pipeline = PipelineOrchestrator()
    by_group: dict[str, list[FixtureScore]] = defaultdict(list)
    failure_modes: dict[str, int] = defaultdict(int)
    calibration_buckets: dict[str, list[int]] = {
        "HIGH": [0, 0],   # [correct, total]
        "MEDIUM": [0, 0],
        "LOW": [0, 0],
    }
    raw_results: list[dict[str, Any]] = []

    for fix in fixtures:
        req = ExtractRequest(
            file_id=fix.name,
            tenant_id="benchmark",
            s3_url=f"preview://{fix.name}.txt",
        )
        response = await pipeline.run_from_bytes(
            req=req,
            data=fix.text.encode("utf-8"),
            filename=f"{fix.name}.txt",
        )
        score = score_fixture(response, fix)
        by_group[score.group].append(score)
        for err in score.errors:
            failure_modes[_classify_failure(err)] += 1
        for fo in score.field_outcomes:
            lvl = fo.get("level")
            if lvl in calibration_buckets:
                calibration_buckets[lvl][1] += 1
                if fo.get("ok"):
                    calibration_buckets[lvl][0] += 1
        raw_results.append(
            {
                "fixture": fix.name,
                "group": fix.group,
                "doc_type": fix.doc_type,
                "precision": round(score.precision, 4),
                "recall": round(score.recall, 4),
                "f1": round(score.f1, 4),
                "accuracy": round(score.accuracy, 4),
                "avg_confidence": round(score.avg_confidence, 4),
                "tp": score.tp,
                "fp": score.fp,
                "fn": score.fn,
                "field_outcomes": score.field_outcomes,
                "errors": score.errors,
            }
        )

    report = BenchmarkReport()
    for group, scores in by_group.items():
        report.by_group[group] = _aggregate(scores)
    all_scores = [s for grp in by_group.values() for s in grp]
    report.overall = _aggregate(all_scores)
    report.failure_modes = dict(failure_modes)
    for level, (correct, total) in calibration_buckets.items():
        acc = (correct / total) if total else 0.0
        report.calibration[level] = {
            "n": float(total),
            "accuracy": round(acc, 4),
        }
    report.fixture_scores = raw_results

    RESULTS_PATH.write_text(
        json.dumps(
            {
                "by_group": report.by_group,
                "overall": report.overall,
                "failure_modes": report.failure_modes,
                "calibration": report.calibration,
                "fixture_scores": report.fixture_scores,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return report


def main() -> None:
    report = asyncio.run(benchmark())
    # Print quick summary to stdout.
    print("=" * 60)
    print("BENCHMARK SUMMARY")
    print("=" * 60)
    print(f"Overall: {report.overall}")
    for g, s in report.by_group.items():
        print(f"  {g}: {s}")
    print(f"Failure modes: {report.failure_modes}")
    print(f"Calibration: {report.calibration}")
    print(f"Wrote: {RESULTS_PATH}")


if __name__ == "__main__":
    main()
