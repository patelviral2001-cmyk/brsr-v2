"""Orchestration: bytes → UniversalEnergyDocument, with HYBRID routing.

Policy (user-chosen): try the free native-text path first; if the result needs
review (low confidence or a validation flag) AND Document AI is available,
re-run the document through Document AI and keep whichever extraction scores
higher. Pure native and pure cloud both remain available as edge cases.

Reused by the CLI and (later) the REST API/worker, so routing lives in one place.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from packages.canonical import CanonicalDictionary, UniversalEnergyDocument
from services.ocr_service.providers import OCRRouter
from services.ocr_service.providers.native_pdf import NativePdfProvider
from packages.canonical.schema import ValidationStatus
from services.doc_intelligence.classify import classify
from services.doc_intelligence.mapper import map_layout
from services.doc_intelligence.validate import validate
from services.doc_intelligence.confidence import score, CRITICAL, _find

NATIVE_MIN = 200
_BAD = (ValidationStatus.FLAGGED, ValidationStatus.INVALID)


def _critical_health(doc: UniversalEnergyDocument) -> int:
    """# of critical fields that are present AND not flagged/invalid. A higher
    score means a more trustworthy extraction — used to compare native vs DocAI
    so a confidently-wrong native value loses to a clean DocAI one."""
    n = 0
    for label in CRITICAL:
        f = _find(doc, label)
        if f and f.is_present() and f.validation_status not in _BAD:
            n += 1
    return n


@dataclass
class Result:
    doc: UniversalEnergyDocument
    route: str                      # native | document_ai | native→document_ai | needs_ocr
    escalated: bool = False
    native_confidence: Optional[float] = None


def _run_di(layout, resolver, llm) -> UniversalEnergyDocument:
    dt, conf = classify(layout.text)
    doc = map_layout(layout, dt, resolver, doc_type_conf=conf, llm=llm)
    return score(validate(doc))


def process(data: bytes, filename: str, mime: str, resolver: CanonicalDictionary,
            router: OCRRouter, llm=None, hybrid: bool = True) -> Result:
    raw = NativePdfProvider._raw_text(data) if ("pdf" in (mime or "").lower()
                                                 or filename.lower().endswith(".pdf")) else \
        data.decode("utf-8", "ignore")
    docai_ok = router.document_ai.available()

    # primary route
    if len(raw) >= NATIVE_MIN:
        doc = _run_di(NativePdfProvider.from_text(raw, resolver=resolver), resolver, llm)
        route = "native"
    elif docai_ok:
        doc = _run_di(router.document_ai.extract(data, mime, filename), resolver, llm)
        return Result(doc, "document_ai")
    else:
        # scanned but no cloud OCR — best effort on whatever text exists
        doc = _run_di(NativePdfProvider.from_text(raw, resolver=resolver), resolver, llm)
        doc.validation.needs_review = True
        doc.validation.review_reasons.append("scanned doc, Document AI unavailable")
        return Result(doc, "needs_ocr")

    # hybrid escalation: native looked weak → try Document AI, keep the better one.
    # "Better" = more healthy critical fields, then higher confidence (so a
    # confidently-wrong native amount loses to a clean DocAI extraction).
    if route == "native" and hybrid and docai_ok and doc.validation.needs_review:
        native_conf = doc.validation.overall_confidence
        try:
            alt = _run_di(router.document_ai.extract(data, mime, filename), resolver, llm)
            native_key = (_critical_health(doc), native_conf)
            alt_key = (_critical_health(alt), alt.validation.overall_confidence)
            if alt_key > native_key:
                return Result(alt, "native→document_ai", escalated=True,
                              native_confidence=native_conf)
        except Exception:
            pass
        return Result(doc, "native", native_confidence=native_conf)

    return Result(doc, route)
