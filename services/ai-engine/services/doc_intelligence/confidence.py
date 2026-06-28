"""Confidence engine + review-queue decision.

Per-field confidence already carries OCR/dictionary/parse signal. Here we fold in
validation outcome and compute a document-level confidence weighted toward the
critical fields, then decide the review-queue routing:

    needs_review  ⇔  overall_confidence < REVIEW_THRESHOLD
                     OR a critical field is missing
                     OR validation found an INVALID check

Nothing reaches "production" without passing — low-confidence/invalid docs are
routed to humans (the model is positioned as ASSISTED extraction).
"""
from __future__ import annotations

from packages.canonical import UniversalEnergyDocument, ValidationStatus

REVIEW_THRESHOLD = 0.95
CRITICAL = ["account_number", "bill_amount", "bill_date"]
CRITICAL_WEIGHT = 3.0


def _find(doc: UniversalEnergyDocument, label: str):
    for sec in (doc.consumer, doc.billing, doc.utility, doc.location, doc.document,
                doc.power_quality, doc.renewable):
        f = sec.get(label)
        if f:
            return f
    return None


def score(doc: UniversalEnergyDocument) -> UniversalEnergyDocument:
    # validation feedback into field confidence
    for f in doc.all_fields():
        if f.validation_status == ValidationStatus.VALID:
            f.confidence = round(min(1.0, f.confidence + 0.03), 3)
        elif f.validation_status == ValidationStatus.INVALID:
            f.confidence = round(f.confidence * 0.5, 3)
        elif f.validation_status == ValidationStatus.FLAGGED:
            f.confidence = round(f.confidence * 0.6, 3)

    weighted, wsum = 0.0, 0.0
    for f in doc.all_fields():
        if not f.is_present():
            continue
        w = CRITICAL_WEIGHT if f.canonical_label in CRITICAL else 1.0
        weighted += w * f.confidence
        wsum += w
    overall = round(weighted / wsum, 3) if wsum else 0.0

    reasons: list[str] = []
    for c in CRITICAL:
        f = _find(doc, c)
        if not (f and f.is_present()):
            reasons.append(f"missing critical field: {c}")
    if doc.validation.overall_status == ValidationStatus.INVALID:
        reasons.append("validation: an INVALID check (impossible data)")
    if doc.validation.overall_status == ValidationStatus.FLAGGED:
        reasons.append("validation: a FLAGGED check (could not reconcile)")
    if overall < REVIEW_THRESHOLD:
        reasons.append(f"confidence {overall:.2f} < {REVIEW_THRESHOLD:.2f}")

    doc.validation.overall_confidence = overall
    doc.validation.needs_review = bool(reasons)
    doc.validation.review_reasons = reasons
    return doc
