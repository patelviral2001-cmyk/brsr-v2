"""Slim UEDI-powered ai-engine for the zip1 backend.

Implements the same HTTP contract the zip1 api uses (POST /extract with a
callback to /files/extraction-callback) but the brain is the UEDI engine
(native PDF / Google Document AI / Vision → hybrid canonical mapper → validation
→ confidence). Deliberately self-contained so it needs none of zip1's heavy
extraction stack (langchain/langgraph/qdrant/boto3).

Run:  cd services/ai-engine && python -m uvicorn app.main_uedi:app --port 8100
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
import sys
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from packages.env import load_env
load_env(str(ENGINE_ROOT / ".env"))
load_env(r"C:\Users\admin\uedi\.env")

from packages.canonical import CanonicalDictionary, UniversalEnergyDocument
from services.ocr_service.providers import OCRRouter
from services.doc_intelligence.llm_provider import get_llm
from services.pipeline import process as uedi_process

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ai-engine-uedi")

CALLBACK_SECRET = os.environ.get("BACKEND_CALLBACK_SECRET", "dev_internal_cb_secret_0123456789_abcdefgh")
RESOLVER = CanonicalDictionary.from_seed()
ROUTER = OCRRouter()
LLM = get_llm()

app = FastAPI(title="THE ESG — ai-engine (UEDI)", version="2.0.0-uedi")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ExtractRequest(BaseModel):
    file_id: str
    tenant_id: str
    s3_url: str
    doc_type_hint: Optional[str] = None
    callback_url: Optional[str] = None
    callback_secret_header: str = "x-internal-secret"
    locale: str = "en-IN"


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-engine", "engine": "uedi",
            "document_ai": ROUTER.document_ai.available(), "llm_fallback": LLM is not None}


@app.get("/ready")
def ready():
    return {"status": "ready"}


@app.post("/extract")
async def extract(req: ExtractRequest, background: BackgroundTasks):
    if req.callback_url:
        background.add_task(_run, req)
        return {"status": "accepted", "file_id": req.file_id}
    return await _extract_payload(req)        # sync


def _to_callback(file_id: str, tenant_id: str, doc: UniversalEnergyDocument) -> dict:
    review = doc.validation.needs_review
    fields = []

    def add(key, value, unit, conf, page=None, raw=None):
        val = None
        try:
            val = float(str(value).replace(",", ""))
        except (TypeError, ValueError):
            val = None if value is None else str(value)
        fields.append({"fieldKey": key, "value": val, "unit": unit,
                       "confidence": round(min(max(conf, 0.0), 1.0), 4),
                       "pageNumber": page, "bbox": [],
                       "evidenceText": (raw or None)})

    for sec in ("consumer", "billing", "utility", "location", "document",
                "power_quality", "renewable"):
        for f in getattr(doc, sec).fields.values():
            if f.is_present() and f.canonical_label != "doc_type":
                add(f.canonical_label, f.value, f.unit, f.confidence, f.source_page)
    for m in doc.meters:
        if m.consumption and m.consumption.is_present():
            add(f"meter_{m.energy_type}_consumption", m.consumption.value,
                m.energy_type, m.consumption.confidence)
    for e in doc.energy_flow:
        add(f"flow_{e.code}", e.quantity.value, e.quantity.unit, e.quantity.confidence)

    conf = round(sum(f["confidence"] for f in fields) / len(fields), 4) if fields else 0.0
    return {"documentId": file_id, "tenantId": tenant_id, "status": "EXTRACTED",
            "error": None, "fields": fields, "documentConfidence": conf,
            "needsReview": bool(review)}


async def _extract_payload(req: ExtractRequest) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.get(req.s3_url)
        r.raise_for_status()
        data = r.content
    filename = req.s3_url.split("?")[0].rsplit("/", 1)[-1]
    mime = mimetypes.guess_type(filename)[0] or "application/pdf"
    res = uedi_process(data, filename, mime, RESOLVER, ROUTER, llm=LLM, hybrid=True)
    return _to_callback(req.file_id, req.tenant_id, res.doc)


async def _run(req: ExtractRequest) -> None:
    t0 = time.time()
    log = logger.getChild(req.file_id[:8])
    try:
        payload = await _extract_payload(req)
        log.info("extracted %d fields conf=%s review=%s in %dms", len(payload["fields"]),
                 payload["documentConfidence"], payload["needsReview"], int((time.time() - t0) * 1000))
    except Exception as e:
        log.exception("extract failed: %s", e)
        payload = {"documentId": req.file_id, "tenantId": req.tenant_id,
                   "status": "FAILED", "error": str(e)[:300], "fields": [],
                   "documentConfidence": 0.0, "needsReview": True}
    await _deliver(req, payload)


async def _deliver(req: ExtractRequest, payload: dict) -> None:
    if not req.callback_url:
        return
    headers = {"content-type": "application/json",
               (req.callback_secret_header or "x-internal-secret"): CALLBACK_SECRET}
    async with httpx.AsyncClient(timeout=20.0) as c:
        for attempt in range(3):
            try:
                resp = await c.post(req.callback_url, json=payload, headers=headers)
                if resp.status_code < 300:
                    logger.info("callback delivered status=%d", resp.status_code)
                    return
                logger.warning("callback non-2xx=%d attempt=%d body=%s",
                               resp.status_code, attempt, resp.text[:200])
            except Exception as e:
                logger.warning("callback err attempt=%d: %s", attempt, e)
            await asyncio.sleep(2 * (attempt + 1))
    logger.error("callback failed after retries file=%s", req.file_id)
