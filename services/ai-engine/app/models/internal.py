"""Internal models — pipeline data plumbing."""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.responses import BoundingBox


class ChunkKind(str, Enum):
    PARAGRAPH = "paragraph"
    TABLE = "table"
    HEADING = "heading"
    LIST = "list"
    KEY_VALUE = "key_value"
    UNKNOWN = "unknown"


class DocumentChunk(BaseModel):
    """A unit of input fed into the entity extractor."""

    model_config = ConfigDict(extra="forbid")

    chunk_id: str
    page: Optional[int] = None
    bbox: Optional[BoundingBox] = None
    text: str
    kind: ChunkKind = ChunkKind.PARAGRAPH
    sheet: Optional[str] = None
    row: Optional[int] = None
    section_title: Optional[str] = None
    table: Optional[list[list[str]]] = None  # raw 2D table, when kind == TABLE
    meta: dict[str, Any] = Field(default_factory=dict)


class DocTypeAlternative(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_type: str
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class ClassificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_type: str
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    alternative_types: list[DocTypeAlternative] = Field(default_factory=list)
    rationale: Optional[str] = None


class RawField(BaseModel):
    """Intermediate, pre-normalization candidate field."""

    model_config = ConfigDict(extra="forbid")

    canonical_key: Optional[str] = None
    raw_label: Optional[str] = None
    raw_value: Optional[str] = None
    value_num: Optional[float] = None
    unit: Optional[str] = None
    period_text: Optional[str] = None
    chunk_id: Optional[str] = None
    page: Optional[int] = None
    bbox: Optional[BoundingBox] = None
    sheet: Optional[str] = None
    row: Optional[int] = None
    cell: Optional[str] = None
    dimensions: dict[str, Any] = Field(default_factory=dict)
    source: str = Field("unknown", description="regex / llm / table / sheet_handler")
    model_used: Optional[str] = None
    prompt_version: Optional[str] = None
    model_logprob: Optional[float] = None
    notes: Optional[str] = None


class FileKind(str, Enum):
    PDF_NATIVE = "pdf_native"
    PDF_SCANNED = "pdf_scanned"
    XLSX = "xlsx"
    XLS = "xls"
    CSV = "csv"
    IMAGE = "image"
    DOCX = "docx"
    TEXT = "text"
    UNKNOWN = "unknown"


class DocTypeEnum(str, Enum):
    UTILITY_BILL = "UTILITY_BILL"
    FUEL_INVOICE = "FUEL_INVOICE"
    HR_PAYROLL = "HR_PAYROLL"
    HR_HEADCOUNT_SHEET = "HR_HEADCOUNT_SHEET"
    WATER_BILL = "WATER_BILL"
    WASTE_MANIFEST = "WASTE_MANIFEST"
    EHS_INCIDENT_REPORT = "EHS_INCIDENT_REPORT"
    AUDITED_FINANCIALS = "AUDITED_FINANCIALS"
    BOARD_MINUTES = "BOARD_MINUTES"
    CSR_SPEND_REPORT = "CSR_SPEND_REPORT"
    ENERGY_AUDIT = "ENERGY_AUDIT"
    RENEWABLE_PPA = "RENEWABLE_PPA"
    FUGITIVE_LOG = "FUGITIVE_LOG"
    SUPPLIER_SAQ = "SUPPLIER_SAQ"
    GENERIC = "GENERIC"
    UNKNOWN = "UNKNOWN"
