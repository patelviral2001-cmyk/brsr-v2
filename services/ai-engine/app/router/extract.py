"""POST /extract, POST /extract/preview, GET /registry, POST /classify."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.agents.document_classifier import DocumentClassifier
from app.models.requests import ClassifyRequest, ExtractRequest
from app.models.responses import ExtractResponse, ExtractStatus
from app.orchestrator import DocumentOrchestrator
from app.registry import METRIC_REGISTRY
from app.utils.logging import get_logger
from app.utils.s3 import download_to_bytes

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


@router.post("/extract", response_model=ExtractResponse)
async def extract_endpoint(req: ExtractRequest, background_tasks: BackgroundTasks) -> Any:
    orch = _get_orch()

    if req.callback_url:
        # Async mode: schedule background task, return 202.
        async def _run_and_callback() -> None:
            from app.models.responses import ExtractError

            try:
                resp = await orch.extract(req)
            except Exception as e:  # noqa: BLE001
                logger.exception("extract.background_failed", err=str(e))
                resp = ExtractResponse(
                    file_id=req.file_id,
                    tenant_id=req.tenant_id,
                    status=ExtractStatus.FAILED,
                )
                resp.errors.append(
                    ExtractError(stage="background", code="UNHANDLED", message=str(e))
                )
            await orch.deliver_callback(req, resp)

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
    resp = await orch.extract(req)
    return resp


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
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"download failed: {e}") from e
    classifier = _get_classifier()
    preview = data[: 4 * 1024].decode("utf-8", errors="ignore")[:2000]
    result = await classifier.classify(
        filename=filename,
        text_preview=preview,
        tenant_id=req.tenant_id,
    )
    return result.model_dump()
