"""6-layer pipeline orchestrator.

Public surface:

    pipe = PipelineOrchestrator()
    response = await pipe.run(req)

This object is intended to be a drop-in replacement for
``DocumentOrchestrator``: it accepts the same ``ExtractRequest`` and
returns the same ``ExtractResponse``. We preserve backward compatibility
by keeping all S3 download, callback delivery, RAG indexing and
guardrail logic in the legacy orchestrator and only swap the *extraction
core* with the layered pipeline when ``USE_LAYERED_PIPELINE=true``.

The pipeline can also be invoked directly on already-loaded bytes via
``run_from_bytes`` — used by the synthetic benchmark and the preview
endpoint.
"""
from __future__ import annotations

import datetime as dt
import io
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from app.confidence.composite_scorer import CompositeConfidenceScorer
from app.models.internal import FileKind
from app.models.requests import ExtractRequest
from app.models.responses import (
    ExtractError,
    ExtractResponse,
    ExtractStatus,
    ExtractedField,
)
from app.pipeline.layer1_classifier import Layer1Classifier, Layer1Result
from app.pipeline.layer2_layout import Layer2Layout, LayoutPage
from app.pipeline.layer3_tables import Layer3Tables, TableFieldRow
from app.pipeline.layer4_vision_extractor import (
    ExtractedTextField,
    Layer4Vision,
)
from app.pipeline.layer5_mapping import Layer5Mapping, NormalizedField
from app.pipeline.layer6_validation import Layer6Output, Layer6Validation
from app.utils.logging import get_logger

logger = get_logger("pipeline.orchestrator")


# ---------------------------------------------------------------------------
# File-kind detection (copy of the legacy heuristic — keeps backward compat
# without forcing an import of the legacy orchestrator).
# ---------------------------------------------------------------------------


def _detect_kind(data: bytes, filename: str) -> FileKind:
    if not data:
        return FileKind.UNKNOWN
    head = data[:16]
    name = (filename or "").lower()
    if head.startswith(b"%PDF"):
        return FileKind.PDF_NATIVE
    if head[:4] == b"PK\x03\x04":
        if name.endswith(".xlsx") or b"xl/" in data[:4096]:
            return FileKind.XLSX
        return FileKind.XLSX
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return FileKind.IMAGE
    if head[:3] == b"\xFF\xD8\xFF":
        return FileKind.IMAGE
    if name.endswith(".csv"):
        return FileKind.CSV
    if name.endswith(".txt"):
        return FileKind.TEXT
    return FileKind.TEXT  # default for synthetic fixtures


@dataclass
class PipelineStats:
    fields_total: int = 0
    fields_high: int = 0
    fields_medium: int = 0
    fields_low: int = 0
    layer_latencies_ms: dict[str, int] = field(default_factory=dict)


class PipelineOrchestrator:
    """Main 6-layer orchestrator."""

    def __init__(
        self,
        *,
        layer1: Optional[Layer1Classifier] = None,
        layer2: Optional[Layer2Layout] = None,
        layer3: Optional[Layer3Tables] = None,
        layer4: Optional[Layer4Vision] = None,
        layer5: Optional[Layer5Mapping] = None,
        layer6: Optional[Layer6Validation] = None,
        scorer: Optional[CompositeConfidenceScorer] = None,
    ) -> None:
        self.layer1 = layer1 or Layer1Classifier()
        self.layer2 = layer2 or Layer2Layout()
        self.layer3 = layer3 or Layer3Tables()
        self.layer4 = layer4 or Layer4Vision()
        self.layer5 = layer5 or Layer5Mapping()
        self.layer6 = layer6 or Layer6Validation()
        self.scorer = scorer or CompositeConfidenceScorer()

    # ------------------------------------------------------------------
    # Top-level
    # ------------------------------------------------------------------
    async def run(self, req: ExtractRequest, *, data: Optional[bytes] = None) -> ExtractResponse:
        """Run the full pipeline. ``data`` short-circuits the S3 download."""
        t0 = time.perf_counter()
        response = ExtractResponse(
            file_id=req.file_id,
            tenant_id=req.tenant_id,
            status=ExtractStatus.OK,
        )
        if data is None:
            try:
                from app.utils.s3 import download_to_bytes
                data, filename = await download_to_bytes(req.s3_url)
            except Exception as e:  # noqa: BLE001
                response.status = ExtractStatus.FAILED
                response.errors.append(
                    ExtractError(stage="download", code="S3_ERR", message=str(e))
                )
                response.latency_ms = int((time.perf_counter() - t0) * 1000)
                return response
        else:
            filename = req.s3_url.split("/")[-1] or req.file_id

        try:
            return await self.run_from_bytes(
                req=req, data=data, filename=filename, response=response, t0=t0
            )
        except Exception as e:  # noqa: BLE001
            response.status = ExtractStatus.FAILED
            response.errors.append(
                ExtractError(stage="pipeline", code="UNHANDLED", message=str(e))
            )
            response.latency_ms = int((time.perf_counter() - t0) * 1000)
            return response

    async def run_from_bytes(
        self,
        *,
        req: ExtractRequest,
        data: bytes,
        filename: str,
        response: Optional[ExtractResponse] = None,
        t0: Optional[float] = None,
    ) -> ExtractResponse:
        t0 = t0 or time.perf_counter()
        response = response or ExtractResponse(
            file_id=req.file_id,
            tenant_id=req.tenant_id,
            status=ExtractStatus.OK,
        )
        layer_latencies: dict[str, int] = {}

        kind = _detect_kind(data, filename)
        text_for_classifier = ""
        pages: list[LayoutPage] = []

        # ----------------- Layer 2 first (gets text for classifier) ----
        l2_t0 = time.perf_counter()
        if kind == FileKind.PDF_NATIVE:
            pages = await self.layer2.detect_from_pdf(data)
            if not pages:
                pages = [
                    await self.layer2.detect_from_text(
                        data.decode("utf-8", errors="ignore")
                    )
                ]
        elif kind == FileKind.IMAGE:
            pages = [await self.layer2.detect_from_image(data)]
        else:
            text = data.decode("utf-8", errors="ignore")
            pages = [await self.layer2.detect_from_text(text)]
        text_for_classifier = "\n".join(p.text for p in pages)[:4000]
        layer_latencies["layer2"] = int((time.perf_counter() - l2_t0) * 1000)

        # ----------------- Layer 1 -------------------------------------
        l1_t0 = time.perf_counter()
        layer1_result: Layer1Result = await self.layer1.classify(
            filename=filename,
            text_preview=text_for_classifier,
            tenant_id=req.tenant_id,
            hint=req.doc_type_hint,
        )
        layer_latencies["layer1"] = int((time.perf_counter() - l1_t0) * 1000)
        response.doc_type_detected = layer1_result.doc_type
        response.doc_type_confidence = layer1_result.confidence
        response.doc_type_alternatives = [a.model_dump() for a in layer1_result.alternative_types]
        response.summary = text_for_classifier[:1000]

        # ----------------- Layer 3 -------------------------------------
        l3_t0 = time.perf_counter()
        table_fields: list[TableFieldRow] = await self.layer3.extract_tables(
            pages, doc_type=layer1_result.doc_type
        )
        layer_latencies["layer3"] = int((time.perf_counter() - l3_t0) * 1000)

        # ----------------- Layer 4 -------------------------------------
        l4_t0 = time.perf_counter()
        text_fields: list[ExtractedTextField] = await self.layer4.extract_from_text(
            pages,
            doc_type=layer1_result.doc_type,
            period_hint_text=req.reporting_period_hint,
            tenant_id=req.tenant_id,
        )
        layer_latencies["layer4"] = int((time.perf_counter() - l4_t0) * 1000)

        # ----------------- Layer 5 -------------------------------------
        l5_t0 = time.perf_counter()
        normalized: list[NormalizedField] = await self.layer5.normalize_and_merge(
            table_fields=table_fields, text_fields=text_fields
        )
        layer_latencies["layer5"] = int((time.perf_counter() - l5_t0) * 1000)

        # ----------------- Layer 6 -------------------------------------
        l6_t0 = time.perf_counter()
        l6_out: Layer6Output = await self.layer6.validate(
            normalized,
            tenant_id=req.tenant_id,
            doc_type=layer1_result.doc_type,
            industry_hint=req.industry_sector,
        )
        layer_latencies["layer6"] = int((time.perf_counter() - l6_t0) * 1000)

        # ----------------- Composite confidence ------------------------
        scored = self.scorer.score_many(
            l6_out.fields, layer1=layer1_result, layer2_pages=pages
        )
        response.fields = scored

        # ----------------- Status --------------------------------------
        review_needed = any(f.needs_review for f in scored)
        if not scored:
            response.status = ExtractStatus.PARTIAL
            response.errors.append(
                ExtractError(stage="extraction", code="NO_FIELDS", message="No fields extracted.")
            )
        elif review_needed:
            response.status = ExtractStatus.NEEDS_REVIEW
        else:
            response.status = ExtractStatus.OK

        response.extracted_at = dt.datetime.utcnow().isoformat() + "Z"
        response.latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "pipeline.completed",
            file=req.file_id,
            fields=len(scored),
            doc_type=layer1_result.doc_type,
            layer_latencies=layer_latencies,
        )
        return response

    # ------------------------------------------------------------------
    # Stats helper for benchmark
    # ------------------------------------------------------------------
    def _compute_stats(self, fields: list[ExtractedField]) -> PipelineStats:
        from app.models.responses import ConfidenceLevel

        stats = PipelineStats(fields_total=len(fields))
        for f in fields:
            if f.confidence_level == ConfidenceLevel.HIGH:
                stats.fields_high += 1
            elif f.confidence_level == ConfidenceLevel.MEDIUM:
                stats.fields_medium += 1
            else:
                stats.fields_low += 1
        return stats
