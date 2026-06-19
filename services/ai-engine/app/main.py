"""THE ESG — AI engine
Receives /extract requests from the backend, downloads the file from a
presigned URL, runs text extraction + classify + LLM structured extraction,
posts results back to the backend callback URL.
"""
from __future__ import annotations
import asyncio
import logging
import time
from typing import Optional

import httpx
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import get_settings
from .text import text_from_bytes
from .classifier import classify
from .llm import extract_structured
from .schemas import SCHEMA_CODE_FOR_DOC_TYPE

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ai-engine")

settings = get_settings()
app = FastAPI(title="THE ESG — AI engine", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ALLOW_ORIGINS.split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Request / response shapes ─────────────────────────────────────────────

class ExtractRequest(BaseModel):
    file_id: str = Field(..., description="Backend Evidence id")
    s3_url: str = Field(..., description="Presigned GET URL")
    tenant_id: str
    doc_type_hint: Optional[str] = None             # ELECTRICITY_BILL etc.
    callback_url: Optional[str] = None
    callback_secret_header: str = "x-internal-secret"
    mime_type: Optional[str] = None
    original_name: Optional[str] = None


class ExtractAck(BaseModel):
    ok: bool = True
    file_id: str
    queued: bool = True


# ── Health ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-engine", "model": settings.OPENAI_MODEL}


# ── /extract ──────────────────────────────────────────────────────────────

@app.post("/extract", response_model=ExtractAck)
async def extract(req: ExtractRequest, background: BackgroundTasks):
    background.add_task(_run_pipeline, req)
    return ExtractAck(file_id=req.file_id, queued=True)


async def _run_pipeline(req: ExtractRequest) -> None:
    t0 = time.time()
    log = logger.getChild(req.file_id[:8])
    try:
        # 1. download
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(req.s3_url)
            r.raise_for_status()
            data = r.content
        size = len(data)
        log.info("downloaded %d bytes", size)

        # 2. text
        text, ocr = text_from_bytes(data, req.mime_type or "", req.original_name or "")
        log.info("text_len=%d ocr=%s", len(text), ocr)

        # 3. classify
        doc_type, classify_conf = classify(text, req.doc_type_hint)
        schema_code = SCHEMA_CODE_FOR_DOC_TYPE.get(doc_type, "UNKNOWN_V1")
        log.info("doc_type=%s conf=%.2f", doc_type, classify_conf)

        # 4. LLM structured extraction
        payload, extract_conf = extract_structured(text, doc_type)
        log.info("extract_conf=%.2f", extract_conf)

        # 5. callback
        await _deliver_callback(req, schema_code, payload, extract_conf, text[:1500], doc_type)
        log.info("pipeline complete in %dms", int((time.time() - t0) * 1000))
    except Exception as e:
        log.exception("pipeline failed: %s", e)
        # Best-effort error callback
        try:
            await _deliver_callback(
                req, "UNKNOWN_V1", {}, 0.0, "", "UNKNOWN", error=str(e)[:300]
            )
        except Exception:
            pass


async def _deliver_callback(
    req: ExtractRequest,
    schema_code: str,
    payload: dict,
    confidence: float,
    raw_text: str,
    doc_type_detected: str,
    error: Optional[str] = None,
) -> None:
    if not req.callback_url:
        return
    body = {
        "documentId": req.file_id,
        "tenantId":   req.tenant_id,
        "schemaCode": schema_code,
        "payload":    payload,
        "confidence": confidence,
        "rawText":    raw_text,
        "docTypeDetected": doc_type_detected,
        "error":      error,
    }
    headers = {"content-type": "application/json"}
    if settings.BACKEND_CALLBACK_SECRET:
        headers[req.callback_secret_header] = settings.BACKEND_CALLBACK_SECRET

    async with httpx.AsyncClient(timeout=20.0) as client:
        for attempt in range(3):
            try:
                resp = await client.post(req.callback_url, json=body, headers=headers)
                if resp.status_code < 300:
                    return
                logger.warning("callback non-2xx attempt=%d status=%d", attempt, resp.status_code)
            except Exception as e:
                logger.warning("callback exception attempt=%d err=%s", attempt, e)
            await asyncio.sleep(2 * (attempt + 1))
    logger.error("callback failed after 3 attempts file=%s", req.file_id)
