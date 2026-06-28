"""OCR provider interface + the normalized layout model.

Every provider (Google Document AI, Google Vision, native-PDF) returns the SAME
`NormalizedLayout`. Doc-Intelligence only ever sees this shape, so swapping the
OCR vendor changes nothing downstream. Nothing Google returns is discarded:
pages, blocks, paragraphs, tokens, tables, rows, columns, cells, bounding boxes,
confidence, detected languages — all preserved.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Protocol


class OcrSource(str, Enum):
    NATIVE_PDF = "native_pdf"
    DOCUMENT_AI = "document_ai"
    VISION = "vision"


@dataclass
class BBox:
    page: int = 1
    x: Optional[float] = None    # normalized [0,1]
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None


@dataclass
class Token:
    text: str
    confidence: float = 1.0
    bbox: Optional[BBox] = None


@dataclass
class Cell:
    text: str
    row: int
    col: int
    row_span: int = 1
    col_span: int = 1
    confidence: float = 1.0
    bbox: Optional[BBox] = None


@dataclass
class Table:
    rows: int
    cols: int
    cells: list[Cell] = field(default_factory=list)
    bbox: Optional[BBox] = None

    def grid(self) -> list[list[str]]:
        g = [["" for _ in range(self.cols)] for _ in range(self.rows)]
        for c in self.cells:
            if 0 <= c.row < self.rows and 0 <= c.col < self.cols:
                g[c.row][c.col] = c.text
        return g


@dataclass
class KeyValue:
    """A label→value pair detected by layout (Form Parser, or native geometry)."""
    key: str
    value: str
    key_conf: float = 1.0
    value_conf: float = 1.0
    bbox: Optional[BBox] = None
    page: int = 1


@dataclass
class Block:
    text: str
    confidence: float = 1.0
    bbox: Optional[BBox] = None


@dataclass
class Page:
    number: int
    width: float = 0.0
    height: float = 0.0
    blocks: list[Block] = field(default_factory=list)
    tokens: list[Token] = field(default_factory=list)
    tables: list[Table] = field(default_factory=list)
    key_values: list[KeyValue] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)


@dataclass
class NormalizedLayout:
    source: OcrSource
    text: str                                  # full concatenated text
    pages: list[Page] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)
    mean_word_confidence: Optional[float] = None   # OCR quality signal (0..1)
    provider_meta: dict = field(default_factory=dict)

    def key_values(self) -> list[KeyValue]:
        out: list[KeyValue] = []
        for p in self.pages:
            out.extend(p.key_values)
        return out

    def tables(self) -> list[Table]:
        out: list[Table] = []
        for p in self.pages:
            out.extend(p.tables)
        return out


class OCRProvider(Protocol):
    name: str

    def supports(self, mime: str, filename: str, data: bytes) -> bool:
        ...

    def extract(self, data: bytes, mime: str, filename: str = "") -> NormalizedLayout:
        ...
