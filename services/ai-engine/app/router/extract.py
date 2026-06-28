"""POST /extract, POST /extract/preview, GET /registry, POST /classify.

Resilience guarantees:
  * Sync mode: orchestrator owns retries/timeouts; on unhandled exception
    we still return a FAILED ExtractResponse (the global handler in main.py
    is the last-line defence).
  * Async (callback_url set): we always run ``deliver_callback`` — even on
    background-task failure — so the backend can flip the document to
    EXTRACTION_FAILED. Without this guarantee the document is stuck on
    ``CLASSIFIED`` forever.
  * Guardrails (rate limit, daily budget) are checked inside the
    orchestrator with the per-app Redis client.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from app.agents.document_classifier import DocumentClassifier
from app.models.requests import ClassifyRequest, ExtractRequest
from app.models.responses import ExtractError, ExtractResponse, ExtractStatus
from app.orchestrator import DocumentOrchestrator
from app.uedi_bridge import uedi_extract_response
from app.registry import METRIC_REGISTRY
from app.utils.guardrails import DailyBudgetExceeded, RateLimitExceeded
from app.utils.logging import get_logger, hash_tenant, redact_pii
from app.utils.s3 import S3DownloadError, download_to_bytes

logger = get_logger("router.extract")
router = APIRouter(tags=["extract"])

_orchestrator: DocumentOrchestrator | None = None
_classifier: DocumentClassifier | None = None


def _get_orch() -> DocumentOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = DocumentOrchestrator()
    return _orchestrator


def _get_classifier() -> DocumentClassifier:
    global _classifier
    if _classifier is None:
        _classifier = DocumentClassifier()
    return _classifier


def _failure_response(req: ExtractRequest, code: str, message: str) -> ExtractResponse:
    resp = ExtractResponse(file_id=req.file_id, tenant_id=req.tenant_id, status=ExtractStatus.FAILED)
    resp.errors.append(ExtractError(stage="router", code=code, message=redact_pii(message)))
    return resp


@router.post("/extract", response_model=ExtractResponse)
async def extract_endpoint(
    req: ExtractRequest,
    background_tasks: BackgroundTasks,
    request: Request,
) -> Any:
    orch = _get_orch()
    redis = getattr(request.app.state, "redis", None)

    if req.callback_url:
        # Async mode: schedule background task, return 202.
        async def _run_and_callback() -> None:
            try:
                resp = await uedi_extract_response(req)   # UEDI engine
            except RateLimitExceeded as e:
                resp = _failure_response(req, "RATE_LIMIT", str(e))
            except DailyBudgetExceeded as e:
                resp = _failure_response(req, "DAILY_BUDGET", str(e))
            except Exception as e:  # noqa: BLE001
                logger.exception(
                    "extract.background_failed",
                    err=redact_pii(str(e)),
                    tenant=hash_tenant(req.tenant_id),
                    file=req.file_id,
                )
                resp = _failure_response(req, "UNHANDLED", str(e))

            # ALWAYS attempt callback so the backend can flip status to
            # EXTRACTION_FAILED — never leave the doc in CLASSIFIED limbo.
            try:
                await orch.deliver_callback(req, resp)
            except Exception as e:  # noqa: BLE001
                logger.exception(
                    "extract.callback_after_failure_failed",
                    err=redact_pii(str(e)),
                    tenant=hash_tenant(req.tenant_id),
                    file=req.file_id,
                )

        background_tasks.add_task(_run_and_callback)
        return JSONResponse(
            {
                "status": "accepted",
                "file_id": req.file_id,
                "tenant_id": req.tenant_id,
                "callback_url": str(req.callback_url),
            },
            status_code=202,
        )

    # Sync mode: wait for completion.
    try:
        return await uedi_extract_response(req)           # UEDI engine
    except RateLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e)) from e
    except DailyBudgetExceeded as e:
        raise HTTPException(status_code=503, detail="daily budget exhausted") from e
    except Exception as e:  # noqa: BLE001
        # The orchestrator already wraps its own exceptions, so this is a
        # belt-and-braces safety net.
        logger.exception(
            "extract.sync_failed",
            err=redact_pii(str(e)),
            tenant=hash_tenant(req.tenant_id),
            file=req.file_id,
        )
        return _failure_response(req, "UNHANDLED", str(e))


@router.post("/extract/preview", response_model=ExtractResponse)
async def extract_preview(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    doc_type_hint: str | None = Form(None),
    reporting_period_hint: str | None = Form(None),
    locale: str = Form("en-IN"),
) -> ExtractResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    # Mirror the S3 size cap so an oversized preview doesn't OOM the worker.
    from app.utils.s3 import MAX_S3_BYTES

    if len(data) > MAX_S3_BYTES:
        raise HTTPException(status_code=413, detail="file too large")
    orch = _get_orch()
    return await orch.extract_from_bytes(
        file_id="preview",
        tenant_id=tenant_id,
        filename=file.filename or "upload.bin",
        data=data,
        doc_type_hint=doc_type_hint,
        reporting_period_hint=reporting_period_hint,
        locale=locale,
    )


@router.get("/registry")
async def get_registry() -> dict[str, Any]:
    return {"version": "2.0.0", "count": len(METRIC_REGISTRY), "metrics": METRIC_REGISTRY}


@router.post("/classify")
async def classify_endpoint(req: ClassifyRequest) -> dict[str, Any]:
    try:
        data, filename = await download_to_bytes(req.s3_url)
    except S3DownloadError as e:
        raise HTTPException(status_code=502, detail=f"download failed: {redact_pii(str(e))}") from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"download failed: {redact_pii(str(e))}") from e
    classifier = _get_classifier()
    preview = data[: 4 * 1024].decode("utf-8", errors="ignore")[:2000]
    result = await classifier.classify(
        filename=filename,
        text_preview=preview,
        tenant_id=req.tenant_id,
    )
    return result.model_dump()
