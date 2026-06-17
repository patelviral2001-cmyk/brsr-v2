"""OCR pipeline for scanned PDFs.

If USE_TEXTRACT=true and AWS creds present, sends each page (as PNG) to
AWS Textract for layout-aware OCR. Otherwise falls back to a local pipeline:

  PyMuPDF rasterize → PIL preprocess → Tesseract → naive layout grouping.

LayoutLM is referenced as a future enhancement; the architecture allows
dropping in a transformer-based layout model later.
"""
from __future__ import annotations

import asyncio
import io
from typing import Any, Optional

from PIL import Image, ImageFilter, ImageOps

from app.config import get_settings
from app.extractors.base import BaseExtractor, ExtractionContext, ExtractionResult
from app.models.internal import ChunkKind, DocumentChunk
from app.models.responses import BoundingBox
from app.utils.logging import get_logger

logger = get_logger("extractors.pdf_ocr")


class OcrExtractor(BaseExtractor):
    name = "pdf_ocr"

    async def extract(self, ctx: ExtractionContext) -> ExtractionResult:
        s = get_settings()
        if s.USE_TEXTRACT:
            try:
                return await self._extract_textract(ctx)
            except Exception as e:  # noqa: BLE001
                logger.warning("ocr.textract_failed_fallback_local", err=str(e))
        return await self._extract_local(ctx)

    # ------------------------------------------------------------------
    # Local pipeline
    # ------------------------------------------------------------------
    async def _extract_local(self, ctx: ExtractionContext) -> ExtractionResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_local, ctx)

    def _sync_local(self, ctx: ExtractionContext) -> ExtractionResult:
        import fitz  # PyMuPDF
        import pytesseract

        result = ExtractionResult()
        preview_parts: list[str] = []

        try:
            doc = fitz.open(stream=ctx.file_bytes, filetype="pdf")
            result.page_count = doc.page_count
            for page_no, page in enumerate(doc, start=1):
                pix = page.get_pixmap(dpi=220, alpha=False)
                img_bytes = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_bytes))
                img = _preprocess(img)
                ocr_lang = "eng" if ctx.locale.startswith("en") else ctx.locale.replace("-", "_")
                # Get word-level data with bboxes
                try:
                    data = pytesseract.image_to_data(
                        img, lang=ocr_lang, output_type=pytesseract.Output.DICT
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning("tesseract.image_to_data_failed", page=page_no, err=str(e))
                    text = pytesseract.image_to_string(img, lang=ocr_lang) or ""
                    if text.strip():
                        result.chunks.append(
                            DocumentChunk(
                                chunk_id=self._chunk_id("ocr", page_no, 0),
                                page=page_no,
                                text=text,
                                kind=ChunkKind.PARAGRAPH,
                                meta={"source": self.name, "engine": "tesseract.string"},
                            )
                        )
                        if len(preview_parts) < 4:
                            preview_parts.append(text)
                    continue

                # Group words into block_num clusters from Tesseract's layout
                blocks: dict[int, dict[str, Any]] = {}
                n = len(data["text"])
                for i in range(n):
                    word = (data["text"][i] or "").strip()
                    if not word:
                        continue
                    block_num = int(data["block_num"][i])
                    par_num = int(data["par_num"][i])
                    key = block_num * 1000 + par_num
                    x = int(data["left"][i])
                    y = int(data["top"][i])
                    w = int(data["width"][i])
                    h = int(data["height"][i])
                    conf_raw = data.get("conf", [-1] * n)[i]
                    try:
                        conf = float(conf_raw)
                    except (TypeError, ValueError):
                        conf = -1.0
                    blk = blocks.setdefault(
                        key,
                        {
                            "words": [],
                            "x0": x,
                            "y0": y,
                            "x1": x + w,
                            "y1": y + h,
                            "conf_sum": 0.0,
                            "conf_n": 0,
                        },
                    )
                    blk["words"].append(word)
                    blk["x0"] = min(blk["x0"], x)
                    blk["y0"] = min(blk["y0"], y)
                    blk["x1"] = max(blk["x1"], x + w)
                    blk["y1"] = max(blk["y1"], y + h)
                    if conf >= 0:
                        blk["conf_sum"] += conf
                        blk["conf_n"] += 1

                for idx, (_, blk) in enumerate(sorted(blocks.items())):
                    text = " ".join(blk["words"])
                    if not text.strip():
                        continue
                    mean_conf = (blk["conf_sum"] / blk["conf_n"] / 100.0) if blk["conf_n"] else None
                    result.chunks.append(
                        DocumentChunk(
                            chunk_id=self._chunk_id("ocr", page_no, idx + 1),
                            page=page_no,
                            text=text,
                            kind=ChunkKind.PARAGRAPH,
                            bbox=BoundingBox(x0=blk["x0"], y0=blk["y0"], x1=blk["x1"], y1=blk["y1"]),
                            meta={
                                "source": self.name,
                                "engine": "tesseract.image_to_data",
                                "ocr_conf": mean_conf,
                            },
                        )
                    )
                    if len(preview_parts) < 4:
                        preview_parts.append(text)
            doc.close()
        except Exception as e:  # noqa: BLE001
            logger.error("ocr.local_failed", err=str(e))
            result.notes.append(f"ocr failed: {e}")

        result.text_preview = ("\n\n".join(preview_parts))[:2000]
        return result

    # ------------------------------------------------------------------
    # Textract pipeline
    # ------------------------------------------------------------------
    async def _extract_textract(self, ctx: ExtractionContext) -> ExtractionResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_textract, ctx)

    def _sync_textract(self, ctx: ExtractionContext) -> ExtractionResult:
        import boto3
        import fitz

        result = ExtractionResult()
        s = get_settings()
        client = boto3.client("textract", region_name=s.AWS_REGION)
        preview_parts: list[str] = []

        doc = fitz.open(stream=ctx.file_bytes, filetype="pdf")
        result.page_count = doc.page_count
        for page_no, page in enumerate(doc, start=1):
            pix = page.get_pixmap(dpi=200, alpha=False)
            png_bytes = pix.tobytes("png")
            try:
                resp = client.analyze_document(
                    Document={"Bytes": png_bytes},
                    FeatureTypes=["TABLES", "FORMS"],
                )
            except Exception as e:  # noqa: BLE001
                logger.warning("textract.analyze_failed", page=page_no, err=str(e))
                continue

            blocks = resp.get("Blocks", [])
            lines = [b for b in blocks if b.get("BlockType") == "LINE"]
            tables = self._textract_tables(blocks)

            for li, line in enumerate(lines):
                text = line.get("Text", "") or ""
                if not text.strip():
                    continue
                bbox = line.get("Geometry", {}).get("BoundingBox", {})
                # Normalized 0..1 → multiply by page dimensions later if needed
                result.chunks.append(
                    DocumentChunk(
                        chunk_id=self._chunk_id("tx-line", page_no, li + 1),
                        page=page_no,
                        text=text,
                        kind=ChunkKind.PARAGRAPH,
                        bbox=BoundingBox(
                            x0=float(bbox.get("Left", 0)),
                            y0=float(bbox.get("Top", 0)),
                            x1=float(bbox.get("Left", 0)) + float(bbox.get("Width", 0)),
                            y1=float(bbox.get("Top", 0)) + float(bbox.get("Height", 0)),
                        ),
                        meta={
                            "source": self.name,
                            "engine": "aws.textract",
                            "ocr_conf": line.get("Confidence", 0.0) / 100.0,
                        },
                    )
                )
                if len(preview_parts) < 4:
                    preview_parts.append(text)

            for ti, tbl in enumerate(tables):
                text_repr = "\n".join("\t".join(r) for r in tbl)
                result.chunks.append(
                    DocumentChunk(
                        chunk_id=self._chunk_id("tx-tbl", page_no, ti + 1),
                        page=page_no,
                        text=text_repr,
                        kind=ChunkKind.TABLE,
                        table=tbl,
                        meta={"source": self.name, "engine": "aws.textract.tables"},
                    )
                )
        doc.close()
        result.text_preview = ("\n\n".join(preview_parts))[:2000]
        return result

    @staticmethod
    def _textract_tables(blocks: list[dict[str, Any]]) -> list[list[list[str]]]:
        """Reconstruct tables from Textract block graph."""
        id_to_block = {b["Id"]: b for b in blocks}
        tables_out: list[list[list[str]]] = []
        for b in blocks:
            if b.get("BlockType") != "TABLE":
                continue
            cells: list[dict[str, Any]] = []
            for rel in b.get("Relationships", []):
                if rel.get("Type") != "CHILD":
                    continue
                for cid in rel.get("Ids", []):
                    cell = id_to_block.get(cid)
                    if cell and cell.get("BlockType") == "CELL":
                        cells.append(cell)
            if not cells:
                continue
            max_row = max(int(c.get("RowIndex", 1)) for c in cells)
            max_col = max(int(c.get("ColumnIndex", 1)) for c in cells)
            grid = [["" for _ in range(max_col)] for _ in range(max_row)]
            for c in cells:
                r = int(c.get("RowIndex", 1)) - 1
                col = int(c.get("ColumnIndex", 1)) - 1
                # gather child WORD blocks
                words: list[str] = []
                for rel in c.get("Relationships", []) or []:
                    if rel.get("Type") != "CHILD":
                        continue
                    for wid in rel.get("Ids", []):
                        w = id_to_block.get(wid)
                        if w and w.get("BlockType") == "WORD":
                            words.append(w.get("Text", ""))
                grid[r][col] = " ".join(words)
            tables_out.append(grid)
        return tables_out


def _preprocess(img: Image.Image) -> Image.Image:
    """Lightweight OCR pre-processing — grayscale, autocontrast, sharpen."""
    img = img.convert("L")
    img = ImageOps.autocontrast(img, cutoff=2)
    img = img.filter(ImageFilter.SHARPEN)
    # Adaptive threshold via simple Otsu approximation
    try:
        import numpy as np

        arr = np.array(img)
        # Otsu's method
        hist, _ = np.histogram(arr.ravel(), bins=256, range=(0, 256))
        total = arr.size
        sum_total = float((np.arange(256) * hist).sum())
        sum_b, w_b, max_var, threshold = 0.0, 0, 0.0, 127
        for t in range(256):
            w_b += int(hist[t])
            if w_b == 0:
                continue
            w_f = total - w_b
            if w_f == 0:
                break
            sum_b += t * int(hist[t])
            m_b = sum_b / w_b
            m_f = (sum_total - sum_b) / w_f
            var = w_b * w_f * (m_b - m_f) ** 2
            if var > max_var:
                max_var, threshold = var, t
        arr = (arr > threshold).astype("uint8") * 255
        img = Image.fromarray(arr)
    except Exception:
        pass
    return img
