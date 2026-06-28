"""UEDI bridge for the zip1 ai-engine.

Runs the UEDI engine (OCR Service: native PDF / Google Document AI / Vision →
hybrid canonical mapper → validation → confidence) and maps the result onto the
zip1 `ExtractResponse`, so the existing `deliver_callback` posts it to the api
unchanged. This replaces the langchain orchestrator's extraction without touching
its callback formatting.
"""
from __future__ import annotations

import mimetypes
import sys
import time
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]      # services/ai-engine
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from packages.env import load_env
load_env(str(ENGINE_ROOT / ".env"))
load_env(r"C:\Users\admin\uedi\.env")                  # dev secrets (OpenAI/GCP)

from packages.canonical import CanonicalDictionary, UniversalEnergyDocument
from services.ocr_service.providers import OCRRouter
from services.doc_intelligence.llm_provider import get_llm
from services.pipeline import process as uedi_process

from app.models.requests import ExtractRequest
from app.models.responses import (ConfidenceLevel, ExtractedField, ExtractResponse,
                                   ExtractStatus)
from app.utils.s3 import download_to_bytes

RESOLVER = CanonicalDictionary.from_seed()
ROUTER = OCRRouter()
LLM = get_llm()


def _level(c: float) -> ConfidenceLevel:
    return (ConfidenceLevel.HIGH if c >= 0.9
            else ConfidenceLevel.MEDIUM if c >= 0.7 else ConfidenceLevel.LOW)


def _to_response(file_id: str, tenant_id: str, doc: UniversalEnergyDocument,
                 t0: float) -> ExtractResponse:
    review = doc.validation.needs_review
    fields: list[ExtractedField] = []

    def add(key: str, value, unit, conf: float, page=None, raw=None) -> None:
        num = None
        text = None
        try:
            num = float(str(value).replace(",", ""))
        except (TypeError, ValueError):
            text = None if value is None else str(value)
        fields.append(ExtractedField(
            canonical_key=key, value_num=num, value_text=text,
            unit_canonical=unit, confidence_composite=round(min(max(conf, 0.0), 1.0), 4),
            confidence_level=_level(conf), needs_review=review,
            source_page=page, raw_text=raw))

    for sec_name in ("consumer", "billing", "utility", "location", "document",
                     "power_quality", "renewable"):
        for f in getattr(doc, sec_name).fields.values():
            if f.is_present() and f.canonical_label != "doc_type":
                add(f.canonical_label, f.value, f.unit, f.confidence, f.source_page)
    for m in doc.meters:
        if m.consumption and m.consumption.is_present():
            add(f"meter_{m.energy_type}_consumption", m.consumption.value,
                m.energy_type, m.consumption.confidence)
    for e in doc.energy_flow:
        add(f"flow_{e.code}", e.quantity.value, e.quantity.unit, e.quantity.confidence)

    dt = doc.document.get("doc_type")
    return ExtractResponse(
        file_id=file_id, tenant_id=tenant_id,
        status=ExtractStatus.NEEDS_REVIEW if review else ExtractStatus.OK,
        fields=fields,
        doc_type_detected=str(dt.value) if dt and dt.is_present() else None,
        doc_type_confidence=round(dt.confidence, 4) if dt else 0.0,
        summary=f"UEDI · {doc.metadata.get('ocr_source')} · "
                f"{len(fields)} fields · validation={doc.validation.overall_status.value}",
        latency_ms=int((time.time() - t0) * 1000))


async def uedi_extract_response(req: ExtractRequest) -> ExtractResponse:
    t0 = time.time()
    data, filename = await download_to_bytes(req.s3_url)
    mime = mimetypes.guess_type(filename or "")[0] or "application/pdf"
    res = uedi_process(data, filename or "", mime, RESOLVER, ROUTER, llm=LLM, hybrid=True)
    return _to_response(req.file_id, req.tenant_id, res.doc, t0)
