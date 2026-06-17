"""Native (text-rich) PDF extractor.

Strategy:
  1. pdfplumber for text, tables and bbox metadata (preserves coordinates).
  2. PyMuPDF (fitz) for page text fallback + faster bulk reads.
  3. Emits one DocumentChunk per pdfplumber "word block" group AND one chunk per
     extracted table, with the table's 2D rows.
"""
from __future__ import annotations

import asyncio
import io
from typing import Any

import pdfplumber

from app.extractors.base import BaseExtractor, ExtractionContext, ExtractionResult
from app.models.internal import ChunkKind, DocumentChunk
from app.models.responses import BoundingBox
from app.utils.logging import get_logger

logger = get_logger("extractors.pdf_native")


class PdfNativeExtractor(BaseExtractor):
    name = "pdf_native"

    async def extract(self, ctx: ExtractionContext) -> ExtractionResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_extract, ctx)

    def _sync_extract(self, ctx: ExtractionContext) -> ExtractionResult:
        result = ExtractionResult()
        preview_parts: list[str] = []

        try:
            with pdfplumber.open(io.BytesIO(ctx.file_bytes)) as pdf:
                result.page_count = len(pdf.pages)

                for page_no, page in enumerate(pdf.pages, start=1):
                    # Page-level text
                    text = page.extract_text(x_tolerance=2, y_tolerance=2) or ""
                    if text.strip():
                        result.chunks.append(
                            DocumentChunk(
                                chunk_id=self._chunk_id("pg", page_no, 0),
                                page=page_no,
                                text=text,
                                kind=ChunkKind.PARAGRAPH,
                                bbox=BoundingBox(x0=0, y0=0, x1=float(page.width), y1=float(page.height)),
                                meta={"source": self.name, "extractor": "pdfplumber.page_text"},
                            )
                        )
                        if len(preview_parts) < 4:
                            preview_parts.append(text)

                    # Word-block clustering → finer-grained chunks with bboxes
                    try:
                        words = page.extract_words(x_tolerance=2, y_tolerance=2) or []
                    except Exception as e:  # noqa: BLE001
                        logger.debug("pdfplumber.words_failed", page=page_no, err=str(e))
                        words = []

                    if words:
                        blocks = _cluster_words_into_blocks(words)
                        for i, block in enumerate(blocks):
                            result.chunks.append(
                                DocumentChunk(
                                    chunk_id=self._chunk_id("blk", page_no, i + 1),
                                    page=page_no,
                                    text=block["text"],
                                    kind=ChunkKind.PARAGRAPH,
                                    bbox=BoundingBox(**block["bbox"]),
                                    meta={"source": self.name, "extractor": "pdfplumber.words"},
                                )
                            )

                    # Tables
                    try:
                        tables = page.extract_tables() or []
                    except Exception as e:  # noqa: BLE001
                        logger.debug("pdfplumber.tables_failed", page=page_no, err=str(e))
                        tables = []

                    for ti, raw_table in enumerate(tables):
                        rows = [
                            [(c or "").strip() for c in row]
                            for row in raw_table
                            if row is not None
                        ]
                        if not rows:
                            continue
                        text_repr = _table_to_text(rows)
                        result.chunks.append(
                            DocumentChunk(
                                chunk_id=self._chunk_id("tbl", page_no, ti + 1),
                                page=page_no,
                                text=text_repr,
                                kind=ChunkKind.TABLE,
                                table=rows,
                                meta={"source": self.name, "rows": len(rows), "cols": len(rows[0]) if rows else 0},
                            )
                        )

        except Exception as e:  # noqa: BLE001
            logger.warning("pdf_native.failed", err=str(e))
            # Fallback to PyMuPDF for raw text only.
            try:
                import fitz  # type: ignore[import-not-found]

                doc = fitz.open(stream=ctx.file_bytes, filetype="pdf")
                result.page_count = doc.page_count
                for page_no, page in enumerate(doc, start=1):
                    txt = page.get_text() or ""
                    if txt.strip():
                        result.chunks.append(
                            DocumentChunk(
                                chunk_id=self._chunk_id("pg", page_no, 0),
                                page=page_no,
                                text=txt,
                                kind=ChunkKind.PARAGRAPH,
                                meta={"source": self.name, "extractor": "pymupdf"},
                            )
                        )
                        if len(preview_parts) < 4:
                            preview_parts.append(txt)
                doc.close()
            except Exception as e2:  # noqa: BLE001
                logger.error("pdf_native.pymupdf_failed", err=str(e2))
                result.notes.append(f"pdf parse failed: {e2}")

        result.text_preview = ("\n\n".join(preview_parts))[:2000]
        return result


def _cluster_words_into_blocks(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Cluster words into logical text blocks based on line proximity.

    Two words on the same line if y-overlap > 50%. New block if vertical gap >
    1.5 * average line height.
    """
    if not words:
        return []
    # Sort top-to-bottom, then left-to-right
    words_sorted = sorted(words, key=lambda w: (round(float(w["top"]), 1), float(w["x0"])))
    avg_h = sum(float(w["bottom"]) - float(w["top"]) for w in words_sorted) / len(words_sorted)

    lines: list[list[dict[str, Any]]] = []
    cur_line: list[dict[str, Any]] = []
    cur_top: float | None = None
    for w in words_sorted:
        t = float(w["top"])
        if cur_top is None or abs(t - cur_top) <= avg_h * 0.7:
            cur_line.append(w)
            cur_top = t if cur_top is None else (cur_top + t) / 2
        else:
            lines.append(cur_line)
            cur_line = [w]
            cur_top = t
    if cur_line:
        lines.append(cur_line)

    blocks: list[dict[str, Any]] = []
    cur_block_lines: list[list[dict[str, Any]]] = []
    last_bottom: float | None = None
    for line in lines:
        top = min(float(w["top"]) for w in line)
        if last_bottom is not None and (top - last_bottom) > avg_h * 1.5:
            blocks.append(_compose_block(cur_block_lines))
            cur_block_lines = []
        cur_block_lines.append(line)
        last_bottom = max(float(w["bottom"]) for w in line)
    if cur_block_lines:
        blocks.append(_compose_block(cur_block_lines))
    return [b for b in blocks if b["text"].strip()]


def _compose_block(lines: list[list[dict[str, Any]]]) -> dict[str, Any]:
    if not lines:
        return {"text": "", "bbox": {"x0": 0, "y0": 0, "x1": 0, "y1": 0}}
    text = "\n".join(" ".join(w["text"] for w in line) for line in lines)
    x0 = min(float(w["x0"]) for line in lines for w in line)
    y0 = min(float(w["top"]) for line in lines for w in line)
    x1 = max(float(w["x1"]) for line in lines for w in line)
    y1 = max(float(w["bottom"]) for line in lines for w in line)
    return {"text": text, "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}}


def _table_to_text(rows: list[list[str]]) -> str:
    return "\n".join("\t".join(r) for r in rows)
