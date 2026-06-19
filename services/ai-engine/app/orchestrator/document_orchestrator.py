"""Document orchestrator — top-level entrypoint for extraction.

Flow:
  1. Download from S3 (or accept bytes directly in preview mode).
  2. Detect file kind from magic bytes / extension.
  3. Classify the document (cheap LLM).
  4. Dispatch to the appropriate extractor (PDF native / PDF OCR / XLSX / CSV / image).
  5. Run EntityExtractionAgent (LangGraph) -> ExtractedField list.
  6. Score confidence multi-component.
  7. Mark NEEDS_REVIEW where confidence below threshold.
  8. (fire-and-forget) Index document in Qdrant for Copilot RAG.
  9. Either return inline OR POST to the backend callback URL.

Resilience guarantees (every external call):
  * S3 download: 30s timeout + tenacity retries + 100 MB cap (see utils.s3).
  * OpenAI: 60s wall-clock + tenacity retries (see llm.router).
  * Backend callback: 10s timeout + 3 retries + timing-safe secret header.
  * Any unhandled exception is captured and a FAILED ExtractResponse is
    produced and (when callback_url is set) delivered to the backend.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import time
from typing import Any, Optional

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.agents.document_classifier import DocumentClassifier
from app.agents.entity_extraction_agent import EntityExtractionAgent
from app.config import get_settings
from app.confidence.scorer import ConfidenceScorer
from app.extractors.base import BaseExtractor, ExtractionContext, ExtractionResult
from app.extractors.csv import CsvExtractor
from app.extractors.excel import ExcelExtractor
from app.extractors.image import ImageExtractor
from app.extractors.pdf_native import PdfNativeExtractor
from app.extractors.pdf_ocr import OcrExtractor
from app.models.internal import FileKind
from app.models.requests import ExtractRequest
from app.models.responses import (
    ExtractError,
    ExtractResponse,
    ExtractStatus,
    ExtractedField,
)
from app.rag.indexer import RagIndexer
from app.validation import RuleEngine, ValidationContext, ValidationContextLoader
from app.utils.guardrails import (
    CostBudgetExceeded,
    DailyBudgetExceeded,
    DocBudget,
    RateLimitExceeded,
    get_daily_guard,
    get_rate_limiter,
)
from app.utils.logging import (
    get_logger,
    hash_tenant,
    log_extraction,
    redact_pii,
)
from app.utils.s3 import S3DownloadError, S3ObjectTooLargeError, download_to_bytes

logger = get_logger("orchestrator")


# ---------------------------------------------------------------------------
# File-kind detection
# ---------------------------------------------------------------------------


def detect_file_kind(data: bytes, filename: str) -> FileKind:
    if not data:
        return FileKind.UNKNOWN
    head = data[:16]
    name = filename.lower()

    if head.startswith(b"%PDF"):
        # Native vs scanned heuristic - done downstream when we count text.
        return FileKind.PDF_NATIVE
    if head[:4] == b"PK\x03\x04":
        if name.endswith(".xlsx") or b"xl/" in data[:4096]:
            return FileKind.XLSX
        if name.endswith(".docx") or b"word/" in data[:4096]:
            return FileKind.DOCX
        return FileKind.XLSX
    if head[:8] == b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1":
        if name.endswith(".xls"):
            return FileKind.XLS
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return FileKind.IMAGE
    if head[:3] == b"\xFF\xD8\xFF":  # JPEG
        return FileKind.IMAGE
    if head[:4] in (b"II*\x00", b"MM\x00*"):  # TIFF
        return FileKind.IMAGE
    if name.endswith(".csv") or _looks_like_csv(data[:1024]):
        return FileKind.CSV
    if name.endswith(".txt"):
        return FileKind.TEXT
    return FileKind.UNKNOWN


def _looks_like_csv(sample: bytes) -> bool:
    try:
        s = sample.decode("utf-8", errors="ignore")
    except Exception:
        return False
    if "\n" not in s:
        return False
    first_line = s.splitlines()[0]
    return any(sep in first_line for sep in (",", ";", "\t", "|")) and len(first_line) < 4000


# ---------------------------------------------------------------------------
# Backend-payload mapping
# ---------------------------------------------------------------------------


def _avg(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def to_backend_callback_payload(
    response: ExtractResponse,
    *,
    file_id_override: str | None = None,
) -> dict[str, Any]:
    """Map our internal ExtractResponse to the backend's ExtractionCallbackDto.

    Backend expects::

        {
          documentId: string,
          tenantId: string,
          status: 'EXTRACTED' | 'FAILED' | 'PARTIAL',
          error?: string,
          fields: [{ fieldKey, value, unit?, confidence,
                      pageNumber?, bbox?, evidenceText? }],
          documentConfidence?: number,
          needsReview?: boolean,
        }
    """
    # Map our 4-value status onto backend's 3-value enum. NEEDS_REVIEW
    # collapses into EXTRACTED + needsReview=true so the backend can flag
    # it without losing the extracted fields.
    raw = response.status
    if raw == ExtractStatus.FAILED:
        backend_status = "FAILED"
    elif raw == ExtractStatus.PARTIAL:
        backend_status = "PARTIAL"
    else:
        backend_status = "EXTRACTED"

    needs_review = raw == ExtractStatus.NEEDS_REVIEW or any(f.needs_review for f in response.fields)

    backend_fields: list[dict[str, Any]] = []
    for f in response.fields:
        bbox: list[float] = []
        if f.source_bbox is not None:
            bbox = [f.source_bbox.x0, f.source_bbox.y0, f.source_bbox.x1, f.source_bbox.y1]
        # ISO-format period so the backend can hydrate Prisma Date columns
        # directly. Missing → omit (the backend DTO field is @IsOptional).
        period_start = (
            f.period_start.isoformat()
            if getattr(f, "period_start", None) is not None
            else None
        )
        period_end = (
            f.period_end.isoformat()
            if getattr(f, "period_end", None) is not None
            else None
        )
        backend_fields.append(
            {
                "fieldKey": f.canonical_key,
                "value": (
                    f.value_canonical
                    if f.value_canonical is not None
                    else (f.value_num if f.value_num is not None else f.value_text)
                ),
                "unit": f.unit_canonical or f.unit_extracted,
                "confidence": float(f.confidence_composite or 0.0),
                "pageNumber": f.source_page,
                "bbox": bbox,
                "evidenceText": (f.raw_text or "")[:1000] if f.raw_text else None,
                "periodStart": period_start,
                "periodEnd": period_end,
            }
        )

    document_confidence = (
        _avg([float(f.confidence_composite or 0.0) for f in response.fields])
        if response.fields
        else 0.0
    )

    err_msg: str | None = None
    if response.errors:
        # Concatenate the first three error messages so the backend gets some
        # debug context without exposing raw upstream payloads.
        err_msg = redact_pii(
            " | ".join(f"[{e.stage}/{e.code}] {e.message}" for e in response.errors[:3])
        )

    return {
        "documentId": file_id_override or response.file_id,
        "tenantId": response.tenant_id,
        "status": backend_status,
        "error": err_msg,
        "fields": backend_fields,
        "documentConfidence": round(document_confidence, 4),
        "needsReview": bool(needs_review),
        # Surface classifier output + OCR flag so the backend can keep its
        # Document row metadata in sync. Without this, a doc the user
        # uploaded as OTHER stays OTHER even after the classifier
        # confidently re-types it as UTILITY_BILL, and a scan PDF whose
        # Layer 2 hit the OCR fallback still shows ocrApplied=false.
        "docType": response.doc_type_detected or None,
        "docTypeConfidence": round(float(response.doc_type_confidence or 0.0), 4),
        "ocrApplied": bool(getattr(response, "ocr_applied", False)),
    }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class DocumentOrchestrator:
    def __init__(self) -> None:
        self.s = get_settings()
        self.classifier = DocumentClassifier()
        self.entity_agent = EntityExtractionAgent()
        self.scorer = ConfidenceScorer()
        self.indexer = RagIndexer()
        self.rule_engine = RuleEngine()
        self.context_loader = ValidationContextLoader()
        # 6-layer pipeline (new). When ``USE_LAYERED_PIPELINE=true`` the
        # orchestrator delegates extraction to ``PipelineOrchestrator``
        # while keeping S3 download, callback delivery and guardrails
        # here so the existing FastAPI routers don't change.
        self._layered = None
        if getattr(self.s, "USE_LAYERED_PIPELINE", False):
            try:
                from app.pipeline.orchestrator import PipelineOrchestrator
                self._layered = PipelineOrchestrator()
            except Exception:  # noqa: BLE001
                self._layered = None

    # ------------------------------------------------------------------
    # Public — used by routers
    # ------------------------------------------------------------------
    async def extract(self, req: ExtractRequest, *, redis: Any = None) -> ExtractResponse:
        t0 = time.perf_counter()
        response = ExtractResponse(
            file_id=req.file_id,
            tenant_id=req.tenant_id,
            status=ExtractStatus.OK,
        )

        # ---- Guardrails: rate limit + daily budget ---------------------
        try:
            await get_rate_limiter(redis=redis).check(req.tenant_id)
            await get_daily_guard(redis=redis).check()
        except RateLimitExceeded as e:
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="guardrail", code="RATE_LIMIT", message=str(e)))
            response.latency_ms = int((time.perf_counter() - t0) * 1000)
            self._emit_extraction_log(req, response, model="", tokens_in=0, tokens_out=0, error=str(e))
            return response
        except DailyBudgetExceeded as e:
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="guardrail", code="DAILY_BUDGET", message=str(e)))
            response.latency_ms = int((time.perf_counter() - t0) * 1000)
            self._emit_extraction_log(req, response, model="", tokens_in=0, tokens_out=0, error=str(e))
            return response

        # ---- 1. S3 download --------------------------------------------
        try:
            data, filename = await download_to_bytes(req.s3_url)
        except S3ObjectTooLargeError as e:
            logger.error(
                "download.too_large",
                err=str(e),
                tenant=hash_tenant(req.tenant_id),
                file=req.file_id,
            )
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="download", code="S3_TOO_LARGE", message=str(e)))
            response.latency_ms = int((time.perf_counter() - t0) * 1000)
            self._emit_extraction_log(req, response, model="", tokens_in=0, tokens_out=0, error=str(e))
            return response
        except S3DownloadError as e:
            logger.error(
                "download.failed",
                err=str(e),
                tenant=hash_tenant(req.tenant_id),
                file=req.file_id,
            )
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="download", code="S3_DOWNLOAD", message=str(e)))
            response.latency_ms = int((time.perf_counter() - t0) * 1000)
            self._emit_extraction_log(req, response, model="", tokens_in=0, tokens_out=0, error=str(e))
            return response
        except Exception as e:  # noqa: BLE001  — defensive; download_to_bytes already wraps
            logger.exception(
                "download.unhandled",
                err=redact_pii(str(e)),
                tenant=hash_tenant(req.tenant_id),
                file=req.file_id,
            )
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="download", code="UNHANDLED", message=redact_pii(str(e))))
            response.latency_ms = int((time.perf_counter() - t0) * 1000)
            self._emit_extraction_log(req, response, model="", tokens_in=0, tokens_out=0, error=str(e))
            return response

        return await self._extract_from_bytes(
            req=req,
            data=data,
            filename=filename,
            response=response,
            t0=t0,
            redis=redis,
        )

    async def extract_from_bytes(
        self,
        *,
        file_id: str,
        tenant_id: str,
        filename: str,
        data: bytes,
        doc_type_hint: Optional[str] = None,
        reporting_period_hint: Optional[str] = None,
        locale: str = "en-IN",
    ) -> ExtractResponse:
        """Preview endpoint: skip S3 download, accept raw bytes."""
        t0 = time.perf_counter()
        req = ExtractRequest(
            file_id=file_id,
            tenant_id=tenant_id,
            s3_url="preview://" + filename,
            doc_type_hint=doc_type_hint,
            reporting_period_hint=reporting_period_hint,
            locale=locale,
        )
        response = ExtractResponse(file_id=file_id, tenant_id=tenant_id, status=ExtractStatus.OK)
        return await self._extract_from_bytes(
            req=req,
            data=data,
            filename=filename,
            response=response,
            t0=t0,
            skip_index=True,
        )

    # ------------------------------------------------------------------
    # Core
    # ------------------------------------------------------------------
    async def _extract_from_bytes(
        self,
        *,
        req: ExtractRequest,
        data: bytes,
        filename: str,
        response: ExtractResponse,
        t0: float,
        skip_index: bool = False,
        redis: Any = None,
    ) -> ExtractResponse:
        # -------------------------------------------------------------
        # Layered-pipeline delegation. When USE_LAYERED_PIPELINE=true,
        # route the whole extraction core through PipelineOrchestrator
        # so the DISCOM rule extractor (and any future rule families)
        # can short-circuit the LLM. The legacy path below stays as the
        # fallback for any failure inside the layered pipeline.
        # -------------------------------------------------------------
        if self._layered is not None:
            try:
                logger.info(
                    "orchestrator.start",
                    tenant=hash_tenant(req.tenant_id),
                    file=req.file_id,
                    kind="layered",
                    size=len(data),
                )
                layered_resp = await self._layered.run_from_bytes(
                    req=req, data=data, filename=filename, response=response, t0=t0
                )
                self._emit_extraction_log(
                    req,
                    layered_resp,
                    model="layered",
                    tokens_in=0,
                    tokens_out=0,
                )
                return layered_resp
            except Exception as e:  # noqa: BLE001 - fall back to legacy path on any failure
                # Include exception class name so the failure mode is visible
                # when the exception was raised with no message string (e.g.
                # `raise StopIteration()`), which would otherwise log err="".
                logger.warning(
                    "orchestrator.layered_failed_falling_back",
                    err=redact_pii(str(e)),
                    err_type=type(e).__name__,
                    file=req.file_id,
                    exc_info=True,
                )

        budget = DocBudget(
            document_id=req.file_id,
            tenant_id=req.tenant_id,
            cap_usd=float(self.s.MAX_COST_PER_DOCUMENT_USD),
        )
        model_used: str = ""
        tokens_in = 0
        tokens_out = 0

        try:
            # 2. File kind
            kind = detect_file_kind(data, filename)
            logger.info(
                "orchestrator.start",
                tenant=hash_tenant(req.tenant_id),
                file=req.file_id,
                kind=kind.value,
                size=len(data),
            )

            extractor = self._pick_extractor(kind, data, filename)
            if extractor is None:
                response.status = ExtractStatus.FAILED
                response.errors.append(
                    ExtractError(stage="dispatch", code="UNSUPPORTED_KIND", message=f"kind={kind}")
                )
                response.latency_ms = int((time.perf_counter() - t0) * 1000)
                self._emit_extraction_log(req, response, model=model_used, tokens_in=tokens_in, tokens_out=tokens_out)
                return response

            ctx = ExtractionContext(
                file_id=req.file_id,
                tenant_id=req.tenant_id,
                filename=filename,
                file_bytes=data,
                doc_type_hint=req.doc_type_hint,
                reporting_period_hint=req.reporting_period_hint,
                locale=req.locale,
            )

            # 3 (and re-route to OCR if PDF is text-poor)
            ext_result: ExtractionResult = await extractor.extract(ctx)
            if kind == FileKind.PDF_NATIVE and _is_text_poor(ext_result):
                logger.info("orchestrator.pdf_low_text_falling_back_ocr", file=req.file_id)
                ocr = OcrExtractor()
                ext_result = await ocr.extract(ctx)
                kind = FileKind.PDF_SCANNED

            response.summary = redact_pii((ext_result.text_preview or ""))[:1000]

            # 4. Classify doc type
            classification = await self.classifier.classify(
                filename=filename,
                text_preview=ext_result.text_preview,
                tenant_id=req.tenant_id,
                hint=req.doc_type_hint,
            )
            response.doc_type_detected = classification.doc_type
            response.doc_type_confidence = classification.confidence
            response.doc_type_alternatives = [a.model_dump() for a in classification.alternative_types]

            # Budget check after classifier (cheap call but still costs).
            budget.check()

            # 5. Entity extraction agent
            try:
                fields, agent_issues, model_calls = await self.entity_agent.run(
                    tenant_id=req.tenant_id,
                    file_id=req.file_id,
                    doc_type=classification.doc_type,
                    chunks=ext_result.chunks,
                    prior_raw_fields=ext_result.raw_fields,
                    reporting_period_hint=req.reporting_period_hint,
                )
                response.model_calls += model_calls
                for ai in agent_issues:
                    response.errors.append(
                        ExtractError(
                            stage="entity_agent",
                            code=str(ai.get("code", "AGENT_ISSUE")),
                            message=str(ai.get("message", "")),
                            detail=ai,
                        )
                    )
            except CostBudgetExceeded as e:
                logger.warning("entity_agent.budget_exceeded", err=str(e), file=req.file_id)
                response.status = ExtractStatus.PARTIAL
                response.errors.append(
                    ExtractError(stage="entity_agent", code="COST_BUDGET", message=str(e))
                )
                fields = []
            except Exception as e:  # noqa: BLE001
                logger.error("entity_agent.failed", err=redact_pii(str(e)), file=req.file_id)
                response.status = ExtractStatus.PARTIAL
                response.errors.append(
                    ExtractError(stage="entity_agent", code="AGENT_ERR", message=redact_pii(str(e)))
                )
                fields = []

            # Surface the model actually used (last successful field wins).
            for f in fields:
                if f.model_used:
                    model_used = f.model_used

            # 5b. Post-extraction validation pass — declarative rules engine.
            # Failures attach to field.validation_issues and trip needs_review;
            # confidence scoring (next step) reads validation_score off the
            # component bundle.
            if fields:
                try:
                    val_ctx = await self.context_loader.load(
                        tenant_id=req.tenant_id,
                        fields=fields,
                        doc_type=response.doc_type_detected,
                    )
                    val_result = self.rule_engine.evaluate_all(fields, val_ctx)
                    fields = val_result.revised_fields
                    for issue in val_result.issues:
                        response.errors.append(
                            ExtractError(
                                stage="validation_rules",
                                code=issue.code,
                                message=f"[{issue.severity}] {issue.message}",
                                detail={
                                    "canonical_key": issue.canonical_key,
                                    **(issue.detail or {}),
                                },
                            )
                        )
                except Exception as e:  # noqa: BLE001 — never let validation crash extraction
                    logger.warning(
                        "validation.rules_engine_failed",
                        err=redact_pii(str(e)),
                        file=req.file_id,
                    )

            # 6. Confidence scoring
            fields = self.scorer.score_many(fields)
            response.fields = fields

            # 7. Status from confidence
            review_needed = any(f.needs_review for f in fields)
            if not fields and not response.errors:
                response.status = ExtractStatus.PARTIAL
                response.errors.append(
                    ExtractError(stage="extraction", code="NO_FIELDS", message="No fields extracted.")
                )
            elif review_needed and response.status == ExtractStatus.OK:
                response.status = ExtractStatus.NEEDS_REVIEW

            # 8. RAG indexing (fire-and-forget)
            if not skip_index and ext_result.chunks:
                task = asyncio.create_task(
                    self.indexer.index_document(
                        tenant_id=req.tenant_id,
                        doc_id=req.file_id,
                        filename=filename,
                        data=data,
                    )
                )
                # Swallow background task exceptions so the event loop never
                # surfaces "Task exception was never retrieved" warnings.
                task.add_done_callback(_log_background_exc)
        except CostBudgetExceeded as e:
            logger.warning("orchestrator.budget_exceeded", err=str(e), file=req.file_id)
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="guardrail", code="COST_BUDGET", message=str(e)))
        except Exception as e:  # noqa: BLE001
            logger.exception("orchestrator.unhandled", err=redact_pii(str(e)))
            response.status = ExtractStatus.FAILED
            response.errors.append(
                ExtractError(stage="orchestrator", code="UNHANDLED", message=redact_pii(str(e)))
            )

        response.extracted_at = dt.datetime.utcnow().isoformat() + "Z"
        response.latency_ms = int((time.perf_counter() - t0) * 1000)
        response.total_tokens = (tokens_in + tokens_out) if (tokens_in or tokens_out) else response.total_tokens

        self._emit_extraction_log(
            req,
            response,
            model=model_used,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=budget.spent_usd,
        )
        return response

    # ------------------------------------------------------------------
    # Extractor dispatch
    # ------------------------------------------------------------------
    def _pick_extractor(self, kind: FileKind, data: bytes, filename: str) -> Optional[BaseExtractor]:
        if kind == FileKind.PDF_NATIVE:
            return PdfNativeExtractor()
        if kind == FileKind.PDF_SCANNED:
            return OcrExtractor()
        if kind in (FileKind.XLSX, FileKind.XLS):
            return ExcelExtractor()
        if kind == FileKind.CSV:
            return CsvExtractor()
        if kind == FileKind.IMAGE:
            return ImageExtractor()
        if kind == FileKind.TEXT:
            # Treat plain text as a 1-page native PDF surrogate.
            return _TextSurrogateExtractor()
        if kind == FileKind.DOCX:
            return _DocxExtractor()
        return None

    # ------------------------------------------------------------------
    # Async callback delivery
    # ------------------------------------------------------------------
    async def deliver_callback(self, req: ExtractRequest, response: ExtractResponse) -> None:
        """POST extraction results to the backend's extraction-callback.

        Hardened:
          * 10s wall-clock timeout per attempt.
          * tenacity exponential-backoff retries on transient httpx errors
            or 5xx upstream responses.
          * Secret sent via the header the backend's InternalCallbackGuard
            actually checks (``x-internal-secret``) — overridable in
            settings to keep parity with deployments.
          * Payload mapped to ExtractionCallbackDto so the backend can
            persist the result without further translation.
        """
        if not req.callback_url:
            return
        payload = to_backend_callback_payload(response)
        body = json.dumps(payload, default=str)

        header_name = (req.callback_secret_header or self.s.BACKEND_CALLBACK_HEADER or "x-internal-secret").lower()
        headers = {
            "Content-Type": "application/json",
            "X-AI-Engine-Version": "2.0.0",
            header_name: self.s.BACKEND_CALLBACK_SECRET,
        }
        timeout = httpx.Timeout(
            connect=5.0,
            read=float(self.s.BACKEND_CALLBACK_TIMEOUT_SECONDS),
            write=float(self.s.BACKEND_CALLBACK_TIMEOUT_SECONDS),
            pool=float(self.s.BACKEND_CALLBACK_TIMEOUT_SECONDS),
        )

        attempts = max(1, int(self.s.BACKEND_CALLBACK_MAX_RETRIES))
        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(attempts),
                wait=wait_exponential(multiplier=0.5, min=0.5, max=8.0),
                retry=retry_if_exception_type((httpx.TransportError, httpx.TimeoutException, _Transient5xx)),
                reraise=True,
            ):
                with attempt:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        resp = await client.post(str(req.callback_url), headers=headers, content=body)
                        if 500 <= resp.status_code < 600:
                            raise _Transient5xx(f"backend returned {resp.status_code}")
                        resp.raise_for_status()
                        logger.info(
                            "callback.delivered",
                            url=str(req.callback_url),
                            status=resp.status_code,
                            tenant=hash_tenant(req.tenant_id),
                            file=req.file_id,
                        )
        except Exception as e:  # noqa: BLE001
            # Logged with PII redaction so a leaked tenant id in the URL/error
            # text doesn't end up in plaintext logs.
            logger.error(
                "callback.failed",
                url=str(req.callback_url),
                err=redact_pii(str(e)),
                tenant=hash_tenant(req.tenant_id),
                file=req.file_id,
            )

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------
    def _emit_extraction_log(
        self,
        req: ExtractRequest,
        response: ExtractResponse,
        *,
        model: str = "",
        tokens_in: int = 0,
        tokens_out: int = 0,
        cost_usd: float = 0.0,
        error: str | None = None,
    ) -> None:
        err_text: str | None = error
        if err_text is None and response.errors:
            err_text = " | ".join(f"{e.code}:{e.message}" for e in response.errors[:3])
        log_extraction(
            tenant_id=req.tenant_id,
            document_id=req.file_id,
            model_used=model or None,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=response.latency_ms,
            status=response.status.value,
            cost_usd=cost_usd,
            error=err_text,
            extra={
                "model_calls": response.model_calls,
                "field_count": len(response.fields),
                "doc_type": response.doc_type_detected or "",
            },
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _Transient5xx(RuntimeError):
    """Internal flag for tenacity that the backend returned a retryable 5xx."""


def _log_background_exc(task: "asyncio.Task[Any]") -> None:
    """add_done_callback target — log uncaught exceptions from fire-and-forget tasks."""
    try:
        exc = task.exception()
    except asyncio.CancelledError:
        return
    if exc is not None:
        logger.warning("background.task_exception", err=redact_pii(str(exc)))


def _is_text_poor(result: ExtractionResult) -> bool:
    """True if a 'native' PDF actually has almost no text content."""
    if result.page_count == 0:
        return True
    total = sum(len((c.text or "").strip()) for c in result.chunks)
    return total < max(100, 50 * result.page_count)


class _TextSurrogateExtractor(BaseExtractor):
    name = "text"

    async def extract(self, ctx: ExtractionContext) -> ExtractionResult:
        from app.models.internal import ChunkKind, DocumentChunk

        text = ctx.file_bytes.decode("utf-8", errors="ignore")
        chunks = [
            DocumentChunk(
                chunk_id=self._chunk_id("txt", 1, 1),
                page=1,
                text=text,
                kind=ChunkKind.PARAGRAPH,
                meta={"source": "text"},
            )
        ]
        return ExtractionResult(chunks=chunks, page_count=1, text_preview=text[:2000])


class _DocxExtractor(BaseExtractor):
    name = "docx"

    async def extract(self, ctx: ExtractionContext) -> ExtractionResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync, ctx)

    def _sync(self, ctx: ExtractionContext) -> ExtractionResult:
        from app.models.internal import ChunkKind, DocumentChunk

        try:
            from unstructured.partition.docx import partition_docx
            import io as _io

            elements = partition_docx(file=_io.BytesIO(ctx.file_bytes))
            chunks: list[DocumentChunk] = []
            preview: list[str] = []
            for i, el in enumerate(elements):
                t = (getattr(el, "text", "") or "").strip()
                if not t:
                    continue
                chunks.append(
                    DocumentChunk(
                        chunk_id=self._chunk_id("docx", 1, i + 1),
                        page=1,
                        text=t,
                        kind=ChunkKind.PARAGRAPH,
                        meta={"source": "docx", "category": getattr(el, "category", None)},
                    )
                )
                if len(preview) < 6:
                    preview.append(t)
            return ExtractionResult(
                chunks=chunks,
                page_count=1,
                text_preview=("\n".join(preview))[:2000],
            )
        except Exception as e:  # noqa: BLE001
            return ExtractionResult(notes=[f"docx parse failed: {e}"])
