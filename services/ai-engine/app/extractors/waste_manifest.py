"""Rule-based waste-manifest extractor.

Indian Form-10 hazardous waste manifests + general industrial waste registers
list per-category quantities + disposal-method tallies. We extract:

    waste_hazardous_kg
    waste_non_hazardous_kg
    waste_recycled_kg
    waste_to_landfill_kg
    waste_to_incineration_kg
    e_waste_kg
    plastic_waste_kg
    battery_waste_kg

Patterns supported:
  * "Hazardous waste, 6050, Incineration"   (CSV-style row)
  * "Total Hazardous waste: 6050 kg"        (totals block)
  * "Hazardous waste — 6050 kg"             (em-dash variant)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class WasteField:
    metric_key: str
    value: float
    unit: str
    raw_text: str
    confidence: float = 0.93


@dataclass
class WasteExtraction:
    fields: list[WasteField] = field(default_factory=list)
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    overall_confidence: float = 0.0

    @property
    def is_high_confidence(self) -> bool:
        return self.overall_confidence >= 0.85


_SIGS: list[re.Pattern[str]] = [
    re.compile(r"\bWASTE\s+MANIFEST\b", re.I),
    re.compile(r"\bHAZARDOUS\s+WASTE\b", re.I),
    re.compile(r"\bForm\s*[\-\s]*10\b", re.I),
    re.compile(r"\bWaste\s+(?:Category|Generator)\b", re.I),
    re.compile(r"\bdisposal\s+method\b", re.I),
]

# Per-key: list of patterns where the value is in group(1).
# Order matters: "Total X kg" lines come first to prefer authoritative totals.
_PATTERNS_BY_KEY: dict[str, list[re.Pattern[str]]] = {
    "waste_hazardous_kg": [
        re.compile(r"Total\s+Hazardous\s+waste\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
        re.compile(r"^\s*Hazardous\s+waste\s*[,\-:]\s*([\d,]+(?:\.\d+)?)\b", re.I | re.M),
    ],
    "waste_non_hazardous_kg": [
        re.compile(r"Total\s+Non[\-\s]hazardous\s+waste\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
        re.compile(r"^\s*Non[\-\s]hazardous\s+waste\s*[,\-:]\s*([\d,]+(?:\.\d+)?)\b", re.I | re.M),
    ],
    "waste_recycled_kg": [
        re.compile(r"Waste\s+recycled\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
        re.compile(r"(?:Total\s+)?Recycled\s+waste\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
    ],
    "waste_to_landfill_kg": [
        re.compile(r"Waste\s+sent\s+to\s+landfill\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
        re.compile(r"Landfilled\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
    ],
    "waste_to_incineration_kg": [
        re.compile(r"Waste\s+sent\s+to\s+incineration\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
        re.compile(r"Incinerated\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
    ],
    "e_waste_kg": [
        re.compile(r"^\s*E[\-\s]?waste\s*[,\-:]\s*([\d,]+(?:\.\d+)?)\b", re.I | re.M),
        re.compile(r"Total\s+E[\-\s]?waste\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
    ],
    "plastic_waste_kg": [
        re.compile(r"^\s*Plastic\s+waste\s*[,\-:]\s*([\d,]+(?:\.\d+)?)\b", re.I | re.M),
        re.compile(r"Total\s+Plastic\s+waste\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
    ],
    "battery_waste_kg": [
        re.compile(r"^\s*Battery\s+waste\s*[,\-:]\s*([\d,]+(?:\.\d+)?)\b", re.I | re.M),
        re.compile(r"Total\s+Battery\s+waste\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kg", re.I),
    ],
}

_PERIOD_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"(?:Manifest\s+Period|Reporting\s+Period|Period)\s*[:\-]\s*"
        r"(\d{4})-(\d{2})-(\d{2})\s*(?:to|-)\s*(\d{4})-(\d{2})-(\d{2})",
        re.I,
    ),
]


def _parse_num(s: str) -> Optional[float]:
    if not s:
        return None
    cleaned = re.sub(r"[^\d.\-]", "", s.replace(",", "").strip())
    if not cleaned:
        return None
    try:
        v = float(cleaned)
        if v != v:
            return None
        return v
    except ValueError:
        return None


def _parse_period(text: str) -> tuple[Optional[date], Optional[date]]:
    for pat in _PERIOD_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        try:
            return (
                date(int(m.group(1)), int(m.group(2)), int(m.group(3))),
                date(int(m.group(4)), int(m.group(5)), int(m.group(6))),
            )
        except (ValueError, TypeError):
            continue
    return None, None


def extract(text: str) -> Optional[WasteExtraction]:
    if not text or not any(s.search(text) for s in _SIGS):
        return None
    out = WasteExtraction()

    for key, patterns in _PATTERNS_BY_KEY.items():
        for pat in patterns:
            m = pat.search(text)
            if not m:
                continue
            v = _parse_num(m.group(1))
            if v is None or v <= 0:
                continue
            out.fields.append(WasteField(
                metric_key=key, value=v, unit="kg",
                raw_text=m.group(0)[:160], confidence=0.94,
            ))
            break  # first match wins per key (Total preferred over row)

    ps, pe = _parse_period(text)
    if ps and pe:
        out.period_start = ps
        out.period_end = pe

    if not out.fields:
        return None

    base = 0.50
    bonus = 0.06 * len(out.fields)
    if ps and pe:
        bonus += 0.05
    out.overall_confidence = min(0.96, base + bonus)
    return out
