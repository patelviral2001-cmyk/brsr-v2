"""Rule-based water-bill extractor (multi-source).

Indian municipal water bills, borewell readings, and industrial water-budget
sheets typically list a headline `Total water withdrawn` plus per-source
contributions (groundwater, surface water, third-party municipal, seawater,
recycled). The Layer-4 LLM was being asked to do this every time at ~$0.014
per doc; this module captures the same information deterministically at
sub-millisecond cost.

Emits canonical keys present in the Python METRIC_REGISTRY:
    water_withdrawn_total_kl
    water_withdrawn_groundwater_kl
    water_withdrawn_surface_kl
    water_withdrawn_third_party_kl
    water_withdrawn_seawater_kl
    water_recycled_kl
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class WaterField:
    metric_key: str
    value: float
    unit: str
    raw_text: str
    confidence: float = 0.92


@dataclass
class WaterExtraction:
    fields: list[WaterField] = field(default_factory=list)
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    overall_confidence: float = 0.0

    @property
    def is_high_confidence(self) -> bool:
        return self.overall_confidence >= 0.85


# Header signatures — any of these strongly indicates a water bill.
_SIGS: list[re.Pattern[str]] = [
    re.compile(r"\bMUNICIPAL\s+WATER\b", re.I),
    re.compile(r"\bWATER\s+SUPPLY\b", re.I),
    re.compile(r"\bWATER\s+BILL\b", re.I),
    re.compile(r"\bwater\s+withdrawn\b", re.I),
    re.compile(r"\bborewell\b", re.I),
    re.compile(r"\bgroundwater\b", re.I),
]

_TOTAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Total\s+water\s+withdrawn\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I),
    re.compile(r"Total\s+water\s+(?:consumption|consumed)\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I),
    re.compile(r"Net\s+water\s+(?:withdrawn|consumed)\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I),
]

# Per-source patterns. Each entry: (canonical_key, regex)
_SOURCE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # "Source: Third Party (Municipal Supply)" → flags third-party tag
    # without a value; combined with TOTAL.
    ("water_withdrawn_groundwater_kl", re.compile(
        r"Groundwater[^\n:]*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I)),
    ("water_withdrawn_groundwater_kl", re.compile(
        r"Borewell[^\n:]*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I)),
    ("water_withdrawn_surface_kl", re.compile(
        r"Surface\s+water[^\n:]*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I)),
    ("water_withdrawn_third_party_kl", re.compile(
        r"Third[\s\-]Party[^\n:]*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I)),
    ("water_withdrawn_third_party_kl", re.compile(
        r"Municipal\s+Supply[^\n:]*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I)),
    ("water_withdrawn_seawater_kl", re.compile(
        r"Seawater[^\n:]*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I)),
    ("water_recycled_kl", re.compile(
        r"(?:Recycled|Re-?used)\s+water[^\n:]*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kL", re.I)),
]

# Source-tag lines (no value) — when a header says e.g. `Source: Third Party`,
# the TOTAL value also belongs to that source.
_SOURCE_TAGS: list[tuple[str, re.Pattern[str]]] = [
    ("water_withdrawn_groundwater_kl", re.compile(r"Source\s*[:\-][^\n]*\b(?:groundwater|borewell)\b", re.I)),
    ("water_withdrawn_surface_kl",     re.compile(r"Source\s*[:\-][^\n]*\bsurface\s+water\b", re.I)),
    ("water_withdrawn_third_party_kl", re.compile(r"Source\s*[:\-][^\n]*\b(?:third[\s\-]party|municipal)\b", re.I)),
    ("water_withdrawn_seawater_kl",    re.compile(r"Source\s*[:\-][^\n]*\bseawater\b", re.I)),
]

_PERIOD_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"(?:Billing\s+Period|Reading\s+Period|Period)\s*[:\-]\s*"
        r"(\d{4})-(\d{2})-(\d{2})\s*(?:to|-)\s*(\d{4})-(\d{2})-(\d{2})",
        re.I,
    ),
    re.compile(
        r"(?:Billing\s+Period|Period)\s*[:\-]\s*"
        r"(\d{1,2})\s*[\-/\s]+\s*([A-Za-z]+)\s*[\-/\s]+\s*(\d{2,4})"
        r"\s*(?:to|-)\s*"
        r"(\d{1,2})\s*[\-/\s]+\s*([A-Za-z]+)\s*[\-/\s]+\s*(\d{2,4})",
        re.I,
    ),
]

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _parse_num(s: str) -> Optional[float]:
    if not s:
        return None
    cleaned = re.sub(r"[^\d.\-]", "", s.replace(",", "").strip())
    if not cleaned or cleaned in {".", "-", "-."}:
        return None
    try:
        v = float(cleaned)
        if v != v or v in (float("inf"), float("-inf")):
            return None
        return v
    except ValueError:
        return None


def _parse_period(text: str) -> tuple[Optional[date], Optional[date]]:
    for pat in _PERIOD_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        groups = list(m.groups())
        try:
            if len(groups) == 6 and groups[0].isdigit() and len(groups[1]) <= 2:
                # ISO style
                return (
                    date(int(groups[0]), int(groups[1]), int(groups[2])),
                    date(int(groups[3]), int(groups[4]), int(groups[5])),
                )
            if len(groups) == 6:
                d1 = int(groups[0]); m1 = _MONTHS.get(groups[1].strip().lower())
                y1 = int(groups[2]); d2 = int(groups[3])
                m2 = _MONTHS.get(groups[4].strip().lower()); y2 = int(groups[5])
                if y1 < 100: y1 += 2000
                if y2 < 100: y2 += 2000
                if m1 and m2:
                    return date(y1, m1, d1), date(y2, m2, d2)
        except (ValueError, TypeError):
            continue
    return None, None


def extract(text: str) -> Optional[WaterExtraction]:
    if not text or not any(s.search(text) for s in _SIGS):
        return None
    out = WaterExtraction()

    # 1. Headline total.
    total_val: Optional[float] = None
    for pat in _TOTAL_PATTERNS:
        m = pat.search(text)
        if m:
            v = _parse_num(m.group(1))
            if v is not None and v > 0:
                total_val = v
                out.fields.append(WaterField(
                    metric_key="water_withdrawn_total_kl",
                    value=v, unit="kL", raw_text=m.group(0)[:160], confidence=0.95,
                ))
                break

    # 2. Per-source explicit values.
    seen_sources: set[str] = set()
    for key, pat in _SOURCE_PATTERNS:
        m = pat.search(text)
        if m:
            v = _parse_num(m.group(1))
            if v is not None and v > 0:
                if key in seen_sources:
                    continue
                seen_sources.add(key)
                out.fields.append(WaterField(
                    metric_key=key, value=v, unit="kL",
                    raw_text=m.group(0)[:160], confidence=0.93,
                ))

    # 3. Source TAG line + headline total → attribute the total to that source.
    # Only when we have a total and no explicit per-source value for that key.
    if total_val is not None:
        for key, pat in _SOURCE_TAGS:
            if key in seen_sources:
                continue
            if pat.search(text):
                seen_sources.add(key)
                out.fields.append(WaterField(
                    metric_key=key, value=total_val, unit="kL",
                    raw_text=f"Source tag attributes total to {key}", confidence=0.90,
                ))

    # 4. Period.
    ps, pe = _parse_period(text)
    if ps and pe:
        out.period_start = ps
        out.period_end = pe

    if not out.fields:
        return None

    # Base confidence assumes we have a header signature match (which we do
    # to even reach this branch). Each canonical field adds 0.12 (was 0.08
    # — too low for typical 2-field municipal bills); period adds another
    # 0.08. Total caps at 0.96.
    base = 0.60
    bonus = 0.12 * len(out.fields)
    if ps and pe:
        bonus += 0.08
    out.overall_confidence = min(0.96, base + bonus)
    return out
