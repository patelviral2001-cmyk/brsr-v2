"""Rule-based HR headcount extractor.

Indian HR master reports + payroll headcount sheets follow a remarkably
stable shape:
    Total Employees: 879
    Male Employees: 645
    Female Employees: 232
    Permanent Employees: 700
    Contract Workers: 57
    Trainees: 22
    Persons with Disabilities: 28

The Layer-4 LLM was being asked to handle this and would sometimes also
volunteer adjacent percent-rate metrics (Women-in-management %, Attrition
%) which inflated false positives. This focused extractor returns only the
canonical headcount keys, which keeps precision tight.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class HrField:
    metric_key: str
    value: float
    unit: str
    raw_text: str
    confidence: float = 0.92


@dataclass
class HrExtraction:
    fields: list[HrField] = field(default_factory=list)
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    overall_confidence: float = 0.0

    @property
    def is_high_confidence(self) -> bool:
        return self.overall_confidence >= 0.85


_SIGS: list[re.Pattern[str]] = [
    re.compile(r"\bEMPLOYEE\s+MASTER\b", re.I),
    re.compile(r"\bHEADCOUNT\b", re.I),
    re.compile(r"\bPAYROLL\b", re.I),
    re.compile(r"\bHR\s+(?:Master|Report|Register)\b", re.I),
    re.compile(r"\bTotal\s+Employees?\b", re.I),
]

# Only the canonical headcount keys — no rate / percentage emit.
# Each entry: list of patterns; the value is group(1).
_PATTERNS_BY_KEY: dict[str, list[re.Pattern[str]]] = {
    "employee_count_total": [
        re.compile(r"Total\s+(?:number\s+of\s+)?Employees?\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"Total\s+Headcount\s*[:\-]\s*([\d,]+)", re.I),
    ],
    "employee_count_male": [
        re.compile(r"Male\s+Employees?\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"(?:Total\s+)?Male\s+Headcount\s*[:\-]\s*([\d,]+)", re.I),
    ],
    "employee_count_female": [
        re.compile(r"Female\s+Employees?\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"(?:Total\s+)?Female\s+Headcount\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"Women\s+Employees?\s*[:\-]\s*([\d,]+)", re.I),
    ],
    "employee_count_permanent": [
        re.compile(r"Permanent\s+Employees?\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"Full[\-\s]Time\s+Employees?\s*[:\-]\s*([\d,]+)", re.I),
    ],
    "contract_workers_count": [
        re.compile(r"Contract\s+Workers?\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"Contractual\s+Employees?\s*[:\-]\s*([\d,]+)", re.I),
    ],
    "trainees_count": [
        re.compile(r"Trainees?\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"Apprentices?\s*[:\-]\s*([\d,]+)", re.I),
    ],
    "employee_count_pwd": [
        re.compile(r"Persons?\s+with\s+Disabilit(?:ies|y)\s*[:\-]\s*([\d,]+)", re.I),
        re.compile(r"PwD\s*[:\-]\s*([\d,]+)", re.I),
    ],
}

_PERIOD_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"FY\s*(\d{2,4})\s*[-/]\s*(\d{2,4})", re.I),
    re.compile(
        r"(?:Reporting|Snapshot)\s+Date\s*[:\-]\s*(\d{4})-(\d{2})-(\d{2})",
        re.I,
    ),
    re.compile(
        r"Generated\s*[:\-]\s*(\d{4})-(\d{2})-(\d{2})",
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
    # Try FY format first.
    m = _PERIOD_PATTERNS[0].search(text)
    if m:
        try:
            y1 = int(m.group(1)); y2 = int(m.group(2))
            if y1 < 100: y1 += 2000
            if y2 < 100: y2 += 2000
            return date(y1, 4, 1), date(y2, 3, 31)
        except (ValueError, TypeError):
            pass
    # Snapshot / Generated date: synthesise a same-day period as a sane fallback.
    for pat in _PERIOD_PATTERNS[1:]:
        m = pat.search(text)
        if not m:
            continue
        try:
            d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            # HR snapshots conventionally represent the FY they belong to.
            year = d.year if d.month >= 4 else d.year - 1
            return date(year, 4, 1), date(year + 1, 3, 31)
        except (ValueError, TypeError):
            continue
    return None, None


def extract(text: str) -> Optional[HrExtraction]:
    if not text or not any(s.search(text) for s in _SIGS):
        return None
    out = HrExtraction()

    for key, patterns in _PATTERNS_BY_KEY.items():
        for pat in patterns:
            m = pat.search(text)
            if not m:
                continue
            v = _parse_num(m.group(1))
            if v is None or v < 0 or v > 1e7:
                continue
            out.fields.append(HrField(
                metric_key=key, value=v, unit="count",
                raw_text=m.group(0)[:160], confidence=0.94,
            ))
            break

    ps, pe = _parse_period(text)
    if ps and pe:
        out.period_start = ps
        out.period_end = pe

    if not out.fields:
        return None

    base = 0.50
    bonus = 0.07 * len(out.fields)
    if ps and pe:
        bonus += 0.05
    out.overall_confidence = min(0.96, base + bonus)
    return out
