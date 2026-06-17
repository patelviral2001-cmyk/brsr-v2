"""Extractor abstractions.

Each extractor turns raw bytes into a list of `DocumentChunk` plus an optional
list of `RawField` candidates (when the extractor can do regex-fast-pathing
without LLMs). The downstream entity extraction agent consumes the chunks.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from app.models.internal import DocumentChunk, RawField


@dataclass
class ExtractionContext:
    file_id: str
    tenant_id: str
    filename: str
    file_bytes: bytes
    doc_type_hint: Optional[str] = None
    reporting_period_hint: Optional[str] = None
    locale: str = "en-IN"


@dataclass
class ExtractionResult:
    chunks: list[DocumentChunk] = field(default_factory=list)
    raw_fields: list[RawField] = field(default_factory=list)
    page_count: int = 0
    text_preview: str = ""  # first ~2k chars for classifier
    notes: list[str] = field(default_factory=list)


class BaseExtractor(ABC):
    """Abstract base. Subclasses implement async `extract`."""

    name: str = "base"

    @abstractmethod
    async def extract(self, ctx: ExtractionContext) -> ExtractionResult:
        raise NotImplementedError

    # Common helpers
    @staticmethod
    def _chunk_id(prefix: str, page: int | None, idx: int) -> str:
        return f"{prefix}-{page or 0:04d}-{idx:05d}"
