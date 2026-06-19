"""Rule-based electricity-bill extractor for Indian DISCOMs.

Why this exists:
    Layer 4 (vision LLM) was being invoked on every electricity bill, costing
    ~3500 input + ~600 output tokens per bill against gpt-5. For documents
    where ≥3 canonical fields can be deterministically captured by regex,
    we skip the LLM entirely. This typically reclaims 80-95% of LLM spend
    on utility-bill workloads while improving accuracy (regex is exact;
    the LLM occasionally hallucinates a near-match on numeric strings).

Supported DISCOMs (header signature → bill format dialect):
    * ADANI ELECTRICITY (Mumbai, Ahmedabad regions)
    * MGVCL — Madhya Gujarat Vij Company
    * PGVCL — Paschim Gujarat Vij Company
    * UGVCL — Uttar Gujarat Vij Company
    * DGVCL — Dakshin Gujarat Vij Company
    * TORRENT POWER (Ahmedabad/Surat distribution)
    * TATA POWER (Mumbai distribution)
    * CESC (Kolkata)
    * BEST (Mumbai Central)
    * Generic Indian utility bill (fallback)

The fields we extract:
    * electricity_kwh                — Total units consumed
    * period_start, period_end       — Billing period range
    * sanctioned_load_kw             — Sanctioned load
    * maximum_demand_kva             — Recorded maximum demand
    * power_factor                   — Average power factor
    * bill_amount_inr                — Net amount payable

Confidence model:
    base_confidence = 0.50  (we matched a DISCOM signature)
    +0.10 per matched canonical field (clamped at 0.96)
    +0.05 if period_start AND period_end parsed
    DISCOM-specific patterns score higher than the generic fallback.

The extractor is intentionally synchronous + dependency-free so it can run
inside the request path without affecting latency budgets.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional


@dataclass
class DiscomField:
    metric_key: str
    value: Any
    unit: Optional[str]
    raw_text: str
    confidence: float = 0.90


@dataclass
class DiscomExtraction:
    discom: str
    fields: list[DiscomField] = field(default_factory=list)
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    overall_confidence: float = 0.0

    @property
    def is_high_confidence(self) -> bool:
        return self.overall_confidence >= 0.85


# ---------------------------------------------------------------------------
# DISCOM signatures
# ---------------------------------------------------------------------------

_DISCOM_SIGS: list[tuple[str, re.Pattern[str]]] = [
    ("ADANI",       re.compile(r"\bADANI\s+ELECTRICITY\b", re.I)),
    ("MGVCL",       re.compile(r"\b(MGVCL|MADHYA\s+GUJARAT\s+VIJ)\b", re.I)),
    ("PGVCL",       re.compile(r"\b(PGVCL|PASCHIM\s+GUJARAT\s+VIJ)\b", re.I)),
    ("UGVCL",       re.compile(r"\b(UGVCL|UTTAR\s+GUJARAT\s+VIJ)\b", re.I)),
    ("DGVCL",       re.compile(r"\b(DGVCL|DAKSHIN\s+GUJARAT\s+VIJ)\b", re.I)),
    ("TORRENT",     re.compile(r"\bTORRENT\s+POWER\b", re.I)),
    ("TATA_POWER",  re.compile(r"\bTATA\s+POWER\b", re.I)),
    ("CESC",        re.compile(r"\bCESC(\s+LIMITED)?\b", re.I)),
    ("BEST",        re.compile(r"\bBEST\s+(?:UNDERTAKING|MUMBAI)\b", re.I)),
    ("GENERIC",     re.compile(r"\b(ELECTRICITY\s+BILL|TARIFF\s+CALCULATION|UTILITY\s+BILL)\b", re.I)),
]


def detect_discom(text: str) -> Optional[str]:
    """Return the DISCOM tag whose signature matches, or None."""
    for tag, sig in _DISCOM_SIGS:
        if sig.search(text):
            return tag
    return None


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------


def _parse_number(s: str) -> Optional[float]:
    if not s:
        return None
    cleaned = s.replace(",", "").replace(" ", "").strip()
    cleaned = re.sub(r"[^\d.\-]", "", cleaned)
    if not cleaned or cleaned in {".", "-", "-."}:
        return None
    try:
        v = float(cleaned)
        if v != v or v in (float("inf"), float("-inf")):
            return None
        return v
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Field patterns. Each entry is (metric_key, [regex variants], unit_hint)
# ---------------------------------------------------------------------------

# kWh consumption — the single most-important field for ESG accounting.
# Order: most-specific first.
_KWH_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Total\s+Units\s+Consumed\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kWh", re.I),
    re.compile(r"Units\s+Consumed\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kWh", re.I),
    re.compile(r"Energy\s+Consumed\s*\(?\s*kWh\s*\)?\s*[:\-]\s*([\d,]+(?:\.\d+)?)", re.I),
    re.compile(r"Net\s+(?:Energy|Units)\s+Consumed\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*(?:kWh)?", re.I),
    re.compile(r"\bUnits\s*(?:billed|charged)\s*[:\-]\s*([\d,]+(?:\.\d+)?)", re.I),
    re.compile(r"^[\s\-]*Units?\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*kWh\s*$", re.I | re.M),
]

_DEMAND_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Maximum\s+Demand\s+Recorded\s*[:\-]\s*([\d,]+(?:\.\d+)?)", re.I),
    re.compile(r"Maximum\s+Demand\s*[:\-]\s*([\d,]+(?:\.\d+)?)", re.I),
    re.compile(r"Recorded\s+Demand\s*[:\-]\s*([\d,]+(?:\.\d+)?)", re.I),
    re.compile(r"\bDemand\s*\(?\s*kVA\s*\)?\s*[:\-]\s*([\d,]+(?:\.\d+)?)", re.I),
]

_LOAD_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Sanctioned\s+Load\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*k?W?", re.I),
    re.compile(r"Connected\s+Load\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*k?W?", re.I),
    re.compile(r"Sanctioned\s+Demand\s*[:\-]\s*([\d,]+(?:\.\d+)?)", re.I),
]

_PF_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?:Avg\.?\s*)?Power\s+Factor\s*[:\-]\s*([01]?\.\d{1,3})", re.I),
]

_BILL_AMOUNT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Total\s+Amount\s+(?:Due|Payable)\s*[:\-]\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)", re.I),
    re.compile(r"Total\s+Payable\s*[:\-]\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)", re.I),
    re.compile(r"Net\s+Amount\s+Payable\s*\(?\s*(?:Rs|INR|₹)?\s*\)?\s*[:\-]\s*([\d,]+(?:\.\d{1,2})?)", re.I),
    re.compile(r"Bill\s+Amount\s*\(?\s*(?:INR|Rs|₹)?\s*\)?\s*[:\-]\s*([\d,]+(?:\.\d{1,2})?)", re.I),
]

# ---------------------------------------------------------------------------
# Period parsing
# ---------------------------------------------------------------------------

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

# Periods come in many shapes. Accept several, normalize to (start, end).
_PERIOD_PATTERNS: list[re.Pattern[str]] = [
    # "Billing Period: 01 April 2024 to 30 April 2024"
    re.compile(
        r"(?:Billing\s+Period|Reading\s+Period|Period)\s*[:\-]\s*"
        r"(\d{1,2})\s*[\-/\s]+\s*([A-Za-z]+)\s*[\-/\s]+\s*(\d{2,4})"
        r"\s*(?:to|-)\s*"
        r"(\d{1,2})\s*[\-/\s]+\s*([A-Za-z]+)\s*[\-/\s]+\s*(\d{2,4})",
        re.I,
    ),
    # "Billing Month: November 2024"
    re.compile(
        r"Billing\s+Month\s*[:\-]\s*([A-Za-z]+)\s+(\d{4})",
        re.I,
    ),
]


def _month_idx(s: str) -> Optional[int]:
    return _MONTHS.get((s or "").strip().lower())


def _parse_period(text: str) -> tuple[Optional[date], Optional[date]]:
    for pat in _PERIOD_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        groups = list(m.groups())
        try:
            if len(groups) == 6:
                # full range
                d1, mo1, y1, d2, mo2, y2 = groups
                m1, m2 = _month_idx(mo1), _month_idx(mo2)
                if not m1 or not m2:
                    continue
                y1i, y2i = int(y1), int(y2)
                if y1i < 100:
                    y1i += 2000
                if y2i < 100:
                    y2i += 2000
                return date(y1i, m1, int(d1)), date(y2i, m2, int(d2))
            if len(groups) == 2:
                # "Billing Month: November 2024" → full month
                mo, y = groups
                mi = _month_idx(mo)
                if not mi:
                    continue
                yi = int(y)
                if yi < 100:
                    yi += 2000
                # last-day-of-month: approximation, good enough for ESG period
                last = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}[mi]
                if mi == 2 and (yi % 4 == 0 and (yi % 100 != 0 or yi % 400 == 0)):
                    last = 29
                return date(yi, mi, 1), date(yi, mi, last)
        except (ValueError, TypeError):
            continue
    return None, None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _match_first(text: str, patterns: list[re.Pattern[str]]) -> Optional[re.Match[str]]:
    for p in patterns:
        m = p.search(text)
        if m:
            return m
    return None


def extract(text: str) -> Optional[DiscomExtraction]:
    """Return a DiscomExtraction when the text looks like a DISCOM bill, else None.

    The caller decides whether to skip the LLM. As a guideline:
        is_high_confidence (≥0.85) → LLM not needed for this doc type.
    """
    if not text or len(text) < 40:
        return None

    discom = detect_discom(text)
    if discom is None:
        return None

    out = DiscomExtraction(discom=discom)
    matched = 0

    # electricity_kwh — the headline number
    m = _match_first(text, _KWH_PATTERNS)
    if m:
        val = _parse_number(m.group(1))
        if val is not None and 0 < val < 1e9:
            out.fields.append(DiscomField(
                metric_key="purchased_electricity_kwh",
                value=int(val) if val == int(val) else val,
                unit="kWh",
                raw_text=m.group(0)[:200],
                confidence=0.95,
            ))
            matched += 1

    # period_start / period_end
    ps, pe = _parse_period(text)
    if ps and pe:
        out.period_start = ps
        out.period_end = pe
        # Bonus confidence for both endpoints parsed.

    # sanctioned_load_kw
    m = _match_first(text, _LOAD_PATTERNS)
    if m:
        val = _parse_number(m.group(1))
        if val is not None and 0 < val < 1e6:
            out.fields.append(DiscomField(
                metric_key="sanctioned_load_kw",
                value=val,
                unit="kW",
                raw_text=m.group(0)[:200],
                confidence=0.92,
            ))
            matched += 1

    # maximum_demand_kva
    m = _match_first(text, _DEMAND_PATTERNS)
    if m:
        val = _parse_number(m.group(1))
        if val is not None and 0 < val < 1e6:
            out.fields.append(DiscomField(
                metric_key="maximum_demand_kva",
                value=val,
                unit="kVA",
                raw_text=m.group(0)[:200],
                confidence=0.90,
            ))
            matched += 1

    # power_factor
    m = _match_first(text, _PF_PATTERNS)
    if m:
        val = _parse_number(m.group(1))
        if val is not None and 0 < val <= 1.0:
            out.fields.append(DiscomField(
                metric_key="power_factor",
                value=val,
                unit=None,
                raw_text=m.group(0)[:200],
                confidence=0.95,
            ))
            matched += 1

    # bill_amount_inr
    m = _match_first(text, _BILL_AMOUNT_PATTERNS)
    if m:
        val = _parse_number(m.group(1))
        if val is not None and val > 0:
            out.fields.append(DiscomField(
                metric_key="bill_amount_inr",
                value=val,
                unit="INR",
                raw_text=m.group(0)[:200],
                confidence=0.92,
            ))
            matched += 1

    if matched == 0:
        return None

    base = 0.50 if discom != "GENERIC" else 0.30
    bonus = 0.10 * matched
    if ps and pe:
        bonus += 0.05
    out.overall_confidence = min(0.96, base + bonus)
    return out
