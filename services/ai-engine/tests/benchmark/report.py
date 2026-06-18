"""Markdown report writer for the benchmark.

Reads ``benchmark_results.json`` produced by ``runner.py`` and produces a
human-readable markdown file with by-group metrics, failure-mode counts
and confidence calibration.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent
RESULTS_PATH = HERE / "benchmark_results.json"
REPORT_PATH = HERE / "REPORT.md"

GROUP_LABEL = {
    "electricity_bills": "Electricity Bill",
    "fuel_records": "Fuel Invoice",
    "water_bills": "Water Bill",
    "hr_files": "HR / Headcount Sheet",
    "waste_records": "Waste Manifest",
}


def _row(label: str, s: dict) -> str:
    return (
        f"| {label} | {int(s.get('n', 0))} | "
        f"{s.get('precision', 0):.2f} | {s.get('recall', 0):.2f} | "
        f"{s.get('f1', 0):.2f} | {s.get('accuracy', 0):.2f} | "
        f"{s.get('avg_confidence', 0):.2f} |"
    )


def write_report() -> Path:
    if not RESULTS_PATH.exists():
        raise FileNotFoundError(
            f"benchmark_results.json not found at {RESULTS_PATH}; run runner.py first"
        )
    data = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    by_group = data.get("by_group", {})
    overall = data.get("overall", {})
    failure_modes = data.get("failure_modes", {})
    calibration = data.get("calibration", {})
    fixture_scores = data.get("fixture_scores", [])

    lines: list[str] = []
    lines.append("# Extraction Accuracy Benchmark\n")
    lines.append(
        "Synthetic benchmark of the 6-layer extraction pipeline. "
        "Fixtures and ground truth are deterministic (seed=20240618) so the "
        "report is reproducible.\n"
    )

    # ----- By doc type table -----
    lines.append("## By Document Type\n")
    lines.append("| Doc Type | N | Precision | Recall | F1 | Accuracy | Avg Conf |")
    lines.append("|---|---|---|---|---|---|---|")
    for g in ("electricity_bills", "hr_files", "fuel_records", "water_bills", "waste_records"):
        s = by_group.get(g, {})
        if not s:
            continue
        lines.append(_row(GROUP_LABEL.get(g, g), s))
    lines.append(_row("**Overall**", overall))
    lines.append("")

    # ----- Failure modes -----
    total_failures = sum(failure_modes.values())
    lines.append("## Failure Modes\n")
    lines.append(f"- {total_failures} failure(s) across all fixtures")
    for mode, count in sorted(failure_modes.items(), key=lambda x: -x[1]):
        lines.append(f"- {count}x {mode.replace('_', ' ')}")
    lines.append("")

    # ----- Calibration -----
    lines.append("## Confidence Calibration\n")
    for level in ("HIGH", "MEDIUM", "LOW"):
        s = calibration.get(level, {})
        n = int(s.get("n", 0))
        acc = s.get("accuracy", 0.0)
        lines.append(f"- {level} confidence accuracy: {acc:.2f} (n={n})")
    # Calibration error = |predicted - actual|, taking HIGH=0.92, MED=0.75, LOW=0.55 as midpoints.
    midpoints = {"HIGH": 0.925, "MEDIUM": 0.75, "LOW": 0.55}
    total_n = sum(int(calibration.get(l, {}).get("n", 0)) for l in midpoints)
    ce = 0.0
    if total_n:
        for level, mid in midpoints.items():
            s = calibration.get(level, {})
            n = int(s.get("n", 0))
            acc = s.get("accuracy", 0.0)
            ce += (n / total_n) * abs(mid - acc)
    lines.append(f"- Calibration error: {ce * 100:.1f}%")
    lines.append("")

    # ----- Target check -----
    lines.append("## Target Compliance\n")
    target_map = {
        "electricity_bills": 0.95,
        "hr_files": 0.92,
        "fuel_records": 0.92,
        "water_bills": 0.90,
        "waste_records": 0.90,
    }
    lines.append("| Doc Type | Target | Actual | Status |")
    lines.append("|---|---|---|---|")
    for g, target in target_map.items():
        s = by_group.get(g, {})
        actual = s.get("accuracy", 0.0)
        status = "PASS" if actual >= target else "FAIL"
        lines.append(
            f"| {GROUP_LABEL.get(g, g)} | {target:.2f} | {actual:.2f} | {status} |"
        )
    overall_acc = overall.get("accuracy", 0.0)
    overall_status = "PASS" if overall_acc >= 0.92 else "FAIL"
    lines.append(f"| **Overall** | 0.92 | {overall_acc:.2f} | {overall_status} |")
    lines.append("")

    # ----- Per-fixture appendix -----
    lines.append("## Per-Fixture Results (excerpt)\n")
    lines.append("| Fixture | Group | F1 | Accuracy | Avg Conf |")
    lines.append("|---|---|---|---|---|")
    for s in fixture_scores[:25]:
        lines.append(
            f"| {s['fixture']} | {s['group']} | "
            f"{s['f1']:.2f} | {s['accuracy']:.2f} | {s['avg_confidence']:.2f} |"
        )
    if len(fixture_scores) > 25:
        lines.append(f"| ... and {len(fixture_scores) - 25} more | | | | |")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    return REPORT_PATH


def main() -> None:
    p = write_report()
    print(f"Wrote markdown report: {p}")


if __name__ == "__main__":
    main()
