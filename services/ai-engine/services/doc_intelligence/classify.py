"""Document-type classifier — extensible registry, not a fixed enum.

Each entry is pure DATA: positive signal phrases (any language) and a weight.
Adding a new energy document type (REC certificate, wind statement, group-captive
bill, BESS report) is a registry edit, never a code change. The classifier only
*routes*; the mapper + schema are doc-type agnostic, so an unknown type still
flows through with whatever canonical fields resolve.
"""
from __future__ import annotations

import re

# doc_type → list of (signal, weight). Signals are matched case-insensitively.
REGISTRY: dict[str, list[tuple[str, float]]] = {
    "ELECTRICITY_BILL": [
        ("electricity bill", 1.0), ("energy bill", 0.8), ("िवदुत बीजक", 1.0),
        ("vidyut vitran", 0.8), ("units consumed", 0.6), ("kwh", 0.4),
        ("kvah", 0.5), ("net billed unit", 0.7), ("sanction load", 0.5),
        ("tariff", 0.3), ("discom", 0.4), ("energy charges", 0.5),
        ("energy charge", 0.5), ("electricity distribution", 0.7),
        ("distribution company", 0.5), ("connected load", 0.4),
        ("consumerid", 0.5), ("billed demand", 0.4), ("electricity duty", 0.5),
        ("वीज आकार", 0.6), ("ग्राहक क्रमांक", 0.5), ("देयक रक्कम", 0.5),
        ("रिडिंग", 0.4), ("मंजुर भार", 0.4), ("महावितरण", 0.7)],   # Marathi/MSEDCL
    "SOLAR_NET_METERING": [
        ("net metering", 1.0), ("grid export", 0.8), ("export units", 0.7),
        ("surplus solar units", 0.9), ("solar pv capacity", 0.6),
        ("banked units", 0.7), ("net meter", 0.8)],
    "SOLAR_GROSS_METERING": [
        ("gross metering", 1.0), ("gross meter", 0.9), ("generation meter", 0.7),
        ("solar generated", 0.7), ("feed-in tariff", 0.8)],
    "WIND_ENERGY": [
        ("wind energy", 1.0), ("wind generation", 0.9), ("wtg", 0.6),
        ("wind statement", 0.9), ("wind mill", 0.7)],
    "OPEN_ACCESS": [
        ("open access", 1.0), ("oa charges", 0.7), ("wheeling charges", 0.6),
        ("cross subsidy surcharge", 0.7), ("scheduled energy", 0.6),
        ("drawl", 0.5), ("injection", 0.5)],
    "GROUP_CAPTIVE": [
        ("group captive", 1.0), ("captive consumer", 0.8),
        ("captive generating", 0.8), ("26% equity", 0.6)],
    "REC_CERTIFICATE": [
        ("renewable energy certificate", 1.0), ("rec", 0.5),
        ("redemption", 0.5), ("issuance", 0.4), ("vintage", 0.5)],
    "DIESEL_BILL": [
        ("high speed diesel", 1.0), ("hsd", 0.7), ("diesel", 0.8),
        ("furnace oil", 0.7), ("bpcl", 0.5), ("hpcl", 0.5), ("iocl", 0.5),
        ("litres", 0.4)],
    "PNG_BILL": [
        ("natural gas", 0.9), ("png", 0.8), ("scm", 0.6), ("mahanagar gas", 0.7),
        ("indraprastha gas", 0.7), ("gail", 0.6)],
    "WATER_BILL": [
        ("water bill", 1.0), ("water charges", 0.7), ("cubic metre", 0.6),
        ("kilolitre", 0.6), ("jal board", 0.7), ("water supply", 0.6)],
}


def classify(text: str, hint: str | None = None) -> tuple[str, float]:
    """Returns (doc_type, confidence in 0..1)."""
    if hint and hint.upper() in REGISTRY:
        # trust the operator's choice but still report evidence strength
        return hint.upper(), max(_score(text, hint.upper()), 0.6)
    scores = {dt: _score(text, dt) for dt in REGISTRY}
    best = max(scores, key=scores.get)
    if scores[best] >= 0.4:
        return best, round(min(0.99, scores[best]), 3)
    return "UNKNOWN", 0.2


def _score(text: str, doc_type: str) -> float:
    if not text:
        return 0.0
    low = text.lower()
    total = 0.0
    for signal, weight in REGISTRY.get(doc_type, []):
        if signal in low or re.search(re.escape(signal), low):
            total += weight
    # squash to 0..~1 (3+ strong signals saturate)
    return min(1.0, total / 2.5)
