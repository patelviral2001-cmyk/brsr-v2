"""Outbound response models — these go back to the Node backend."""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ExtractStatus(str, Enum):
    OK = "OK"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class BoundingBox(BaseModel):
    """PDF or image bbox in original page coordinates."""

    model_config = ConfigDict(extra="forbid")
    x0: float
    y0: float
    x1: float
    y1: float


class ConfidenceComponents(BaseModel):
    """Components feeding into composite confidence (each 0..1)."""

    model_config = ConfigDict(extra="forbid")
    model_logprob: float = Field(0.85, ge=0.0, le=1.0)
    cross_validation: float = Field(1.0, ge=0.0, le=1.0)
    peer_zscore: float = Field(1.0, ge=0.0, le=1.0)
    schema_validation: float = Field(1.0, ge=0.0, le=1.0)
    cross_source: float = Field(1.0, ge=0.0, le=1.0)
    # Populated by the declarative rules engine. 1.0 = clean, 0.5 = 1 ERROR,
    # 0.0 = ≥2 ERRORs. WARN rules surface in field.validation_issues but do
    # not directly drop this component.
    validation_score: float = Field(1.0, ge=0.0, le=1.0)


class ExtractedField(BaseModel):
    """One extracted (and normalized) metric value."""

    model_config = ConfigDict(extra="forbid")

    canonical_key: str = Field(..., description="Key from METRIC_REGISTRY")
    value_text: Optional[str] = None
    value_num: Optional[float] = None
    unit_extracted: Optional[str] = Field(None, description="Unit as appearing in source")
    unit_canonical: Optional[str] = Field(None, description="Normalized unit symbol")
    value_canonical: Optional[float] = Field(None, description="Value converted to canonical unit")
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    dimensions: dict[str, Any] = Field(default_factory=dict, description="e.g. fuel_type, gender")
    source_page: Optional[int] = None
    source_bbox: Optional[BoundingBox] = None
    source_row: Optional[int] = None
    source_cell: Optional[str] = None
    source_sheet: Optional[str] = None
    raw_text: Optional[str] = None
    confidence_components: ConfidenceComponents = Field(default_factory=ConfidenceComponents)
    confidence_composite: float = Field(0.0, ge=0.0, le=1.0)
    confidence_level: ConfidenceLevel = ConfidenceLevel.MEDIUM
    needs_review: bool = False
    model_used: Optional[str] = None
    prompt_version: Optional[str] = None
    issues: list[str] = Field(default_factory=list)
    validation_issues: list["ValidationIssue"] = Field(
        default_factory=list,
        description="Issues raised by the declarative rules engine — drives HITL review.",
    )

    @field_validator("confidence_composite")
    @classmethod
    def _round_conf(cls, v: float) -> float:
        return round(v, 4)


class ExtractError(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage: str
    code: str
    message: str
    detail: Optional[dict[str, Any]] = None


class ExtractResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_id: str
    tenant_id: str
    status: ExtractStatus
    fields: list[ExtractedField] = Field(default_factory=list)
    doc_type_detected: Optional[str] = None
    doc_type_confidence: float = 0.0
    doc_type_alternatives: list[dict[str, Any]] = Field(default_factory=list)
    summary: Optional[str] = None
    model_calls: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    errors: list[ExtractError] = Field(default_factory=list)
    extracted_at: Optional[str] = None  # ISO timestamp
    # True iff Layer 2 fell back to OCR rasterisation (PyMuPDF + Tesseract)
    # because pdfplumber returned essentially no text. Used so the backend
    # can persist Document.ocrApplied for telemetry / review-UI badges.
    ocr_applied: bool = False


class ValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    canonical_key: str
    severity: str = Field("warning", description="info / warning / error")
    code: str
    message: str
    suggested_value: Optional[float] = None
    detail: dict[str, Any] = Field(default_factory=dict)


class ValidateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    issues: list[ValidationIssue] = Field(default_factory=list)
    revised_fields: list[ExtractedField] = Field(default_factory=list)
    model_calls: int = 0
    latency_ms: int = 0


# ExtractedField references ValidationIssue via forward reference — rebuild now
# that the symbol is defined.
ExtractedField.model_rebuild()
