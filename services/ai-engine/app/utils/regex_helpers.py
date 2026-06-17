"""Precompiled regex patterns for legacy fast-path extraction."""
from __future__ import annotations

import re
from typing import Iterable

# Generic number with optional thousands separators and decimals.
NUMBER_RE = re.compile(r"(?P<num>[\-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[\-+]?\d+(?:\.\d+)?)")

# Common units appearing right after a number, e.g. "12,345 kWh"
UNIT_TAILS: tuple[str, ...] = (
    "kwh", "mwh", "gwh", "gj", "mj", "kj", "tj",
    "kg", "g", "tonnes", "t", "mt", "lb",
    "l", "kl", "ml", "m3", "scm", "nm3",
    "kgco2e", "tco2e", "tco2eq",
    "%", "pct", "percent",
    "inr", "rs", "usd", "lakh", "crore",
    "hours", "hrs", "days", "years",
)
UNIT_TAIL_RE = re.compile(
    r"(?P<num>[\-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[\-+]?\d+(?:\.\d+)?)\s*"
    r"(?P<unit>" + "|".join(re.escape(u) for u in sorted(UNIT_TAILS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)

# Reporting period markers: FY 2024-25, 2024-2025, 2024/25, etc.
PERIOD_RE = re.compile(
    r"(?P<prefix>FY\s*|Fiscal\s+Year\s*|F\.Y\.\s*)?"
    r"(?P<y1>20\d{2})\s*[-/–]\s*(?P<y2>20?\d{2,4})",
    re.IGNORECASE,
)

# Single year
YEAR_RE = re.compile(r"\b(20\d{2})\b")


def compile_patterns(patterns: Iterable[str]) -> list[re.Pattern[str]]:
    return [re.compile(p, re.IGNORECASE | re.MULTILINE) for p in patterns]


def find_numbers_with_units(text: str) -> list[tuple[float, str]]:
    """Returns [(value, unit), ...] from a text blob."""
    out: list[tuple[float, str]] = []
    for m in UNIT_TAIL_RE.finditer(text):
        raw = m.group("num").replace(",", "")
        try:
            v = float(raw)
        except ValueError:
            continue
        out.append((v, m.group("unit")))
    return out
