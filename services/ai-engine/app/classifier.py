"""Keyword classifier — verifies the upload doc-type hint or auto-detects UNKNOWN.
Lightweight on purpose; the LLM extractor handles the heavy lifting per type."""
from __future__ import annotations
import re

DOC_TYPES = ("ELECTRICITY_BILL", "DIESEL_BILL", "WATER_BILL", "PNG_BILL")

KEYWORDS = {
    "ELECTRICITY_BILL": [
        r"\bMSEDCL\b", r"\bMahavitaran\b", r"\bTata Power\b", r"\bTorrent Power\b",
        r"\bBESCOM\b", r"\bAdani Electricity\b", r"\bBSES\b", r"\bMGVCL\b",
        r"\bunits consumed\b", r"\bkWh\b", r"\belectricity bill\b",
        r"\bmeter reading\b", r"\bload\b.*\bkW\b",
    ],
    "DIESEL_BILL": [
        r"\bBPCL\b", r"\bHPCL\b", r"\bIOCL\b", r"\bIndian Oil\b",
        r"\bDIESEL\b", r"\bHigh\s*Speed\s*Diesel\b", r"\bHSD\b",
        r"\bquantity\b.*\b(litres|L)\b", r"\bfurnace oil\b",
    ],
    "WATER_BILL": [
        r"\bwater\b.*\bm[³3]\b", r"\bcubic met(re|er)\b",
        r"\bwater bill\b", r"\bMunicipal\b.*\bwater\b",
        r"\bBMC\b", r"\bDelhi Jal Board\b", r"\bBWSSB\b",
    ],
    "PNG_BILL": [
        r"\bPNG\b", r"\bnatural gas\b", r"\bGAIL\b",
        r"\bMahanagar Gas\b", r"\bIndraprastha Gas\b", r"\bIGL\b",
        r"\bSCM\b.*\bgas\b", r"\bSCMs?\b",
    ],
}


def classify(text: str, hint: str | None = None) -> tuple[str, float]:
    """Returns (doc_type, confidence)."""
    upper = (hint or "").upper().strip()
    if upper in DOC_TYPES:
        # Confirm hint by keyword evidence; otherwise still trust the SM's choice
        score = _keyword_score(text, upper)
        return upper, max(score, 0.6)               # at least 0.6 when hinted

    # No hint or unknown → guess
    scores = {dt: _keyword_score(text, dt) for dt in DOC_TYPES}
    best = max(scores, key=scores.get)
    if scores[best] >= 0.4:
        return best, scores[best]
    return "UNKNOWN", 0.2


def _keyword_score(text: str, doc_type: str) -> float:
    if not text:
        return 0.0
    n_hits = 0
    for pat in KEYWORDS.get(doc_type, []):
        if re.search(pat, text, re.IGNORECASE):
            n_hits += 1
    # Soft scoring: 0 hits = 0.0, 1 = 0.4, 2 = 0.65, 3+ = 0.85
    return min(0.9, n_hits * 0.25)
