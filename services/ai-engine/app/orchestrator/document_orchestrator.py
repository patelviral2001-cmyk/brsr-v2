"""Document orchestrator — top-level entrypoint for extraction.

Flow:
  1. Download from S3 (or accept bytes directly in preview mode).
  2. Detect file kind from magic bytes / extension.
  3. Classify the document (cheap LLM).
  4. Dispatch to the appropriate extractor (PDF native / PDF OCR / XLSX / CSV / image).
  5. Run EntityExtractionAgent (LangGraph) → ExtractedField list.
  6. Score confidence multi-component.
  7. Mark NEEDS_REVIEW where confidence below threshold.
  8. (fire-and-forget) Index document in Qdrant for Copilot RAG.
  9. Either return inline OR POST to the backend callback URL.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import time
from typing import Any, Optional

import httpx

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
from app.utils.logging import get_logger
from app.utils.s3 import download_to_bytes

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
        # Native vs scanned heuristic — done downstream when we count text.
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
# Orchestrator
# ---------------------------------------------------------------------------


class DocumentOrchestrator:
    def __init__(self) -> None:
        self.s = get_settings()
        self.classifier = DocumentClassifier()
        self.entity_agent = EntityExtractionAgent()
        self.scorer = ConfidenceScorer()
        self.indexer = RagIndexer()

    # ------------------------------------------------------------------
    # Public — used by routers
    # ------------------------------------------------------------------
    async def extract(self, req: ExtractRequest) -> ExtractResponse:
        t0 = time.perf_counter()
        response = ExtractResponse(
            file_id=req.file_id,
            tenant_id=req.tenant_id,
            status=ExtractStatus.OK,
        )
        try:
            # 1. Download
            data, filename = await download_to_bytes(req.s3_url)
        except Exception as e:  # noqa: BLE001
            logger.error("download.failed", err=str(e), url=req.s3_url)
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="download", code="S3_DOWNLOAD", message=str(e)))
            response.latency_ms = int((time.perf_counter() - t0) * 1000)
            return response

        return await self._extract_from_bytes(
            req=req,
            data=data,
            filename=filename,
            response=response,
            t0=t0,
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
            req=req, data=data, filename=filename, response=response, t0=t0, skip_index=True
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
    ) -> ExtractResponse:
        try:
            # 2. File kind
            kind = detect_file_kind(data, filename)
            logger.info(
                "orchestrator.start",
                tenant=req.tenant_id,
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

            response.summary = (ext_result.text_preview or "")[:1000]

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
            except Exception as e:  # noqa: BLE001
                logger.error("entity_agent.failed", err=str(e))
                response.status = ExtractStatus.PARTIAL
                response.errors.append(ExtractError(stage="entity_agent", code="AGENT_ERR", message=str(e)))
                fields = []

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
                asyncio.create_task(
                    self.indexer.index_document(
                        tenant_id=req.tenant_id,
                        doc_id=req.file_id,
                        filename=filename,
                        data=data,
                    )
                )
        except Exception as e:  # noqa: BLE001
            logger.exception("orchestrator.unhandled", err=str(e))
            response.status = ExtractStatus.FAILED
            response.errors.append(ExtractError(stage="orchestrator", code="UNHANDLED", message=str(e)))

        response.extracted_at = dt.datetime.utcnow().isoformat() + "Z"
        response.latency_ms = int((time.perf_counter() - t0) * 1000)
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
        if not req.callback_url:
            return
        headers = {
            "Content-Type": "application/json",
            "X-AI-Engine-Version": "2.0.0",
        }
        if req.callback_secret_header:
            headers[req.callback_secret_header] = self.s.BACKEND_CALLBACK_SECRET
        else:
            headers["X-Callback-Secret"] = self.s.BACKEND_CALLBACK_SECRET
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    str(req.callback_url),
                    headers=headers,
                    content=response.model_dump_json(),
                )
                resp.raise_for_status()
                logger.info("callback.delivered", url=str(req.callback_url), status=resp.status_code)
        except Exception as e:  # noqa: BLE001
            logger.error("callback.failed", url=str(req.callback_url), err=str(e))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
