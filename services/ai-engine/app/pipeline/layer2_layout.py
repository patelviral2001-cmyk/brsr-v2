"""Layer 2 — Layout Detection.

For each input page produces a ``LayoutPage`` with:

  * ``blocks``: text blocks with bbox, font-size estimate, header/label flags
  * ``tables``: table regions with bbox, header row, data rows, semantic label

Native PDFs use ``pdfplumber`` (page.extract_words + page.extract_tables).
Scanned PDFs / images use ``pytesseract.image_to_data`` and we group words
into lines by ``top`` + ``height`` proximity.

For *plain text* inputs (e.g. the synthetic benchmark fixtures), the layout
detector falls back to a deterministic line-grouping algorithm:
contiguous lines of similar content are grouped into blocks, and ASCII
"|" / multi-space columnar runs are recognised as table regions.

This layer is intentionally pure-Python and has no LLM calls.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Optional

from app.models.responses import BoundingBox
from app.utils.logging import get_logger

logger = get_logger("pipeline.layer2")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class TextBlock:
    text: str
    bbox: BoundingBox
    font_size_estimate: float = 10.0
    is_header: bool = False
    is_label: bool = False  # "X:" form labels
    page_no: int = 1


@dataclass
class TableRegion:
    bbox: BoundingBox
    header_row: list[str] = field(default_factory=list)
    data_rows: list[list[str]] = field(default_factory=list)
    semantic_label: str = "GENERIC_TABLE"
    page_no: int = 1


@dataclass
class LayoutPage:
    page_no: int
    width: float
    height: float
    blocks: list[TextBlock] = field(default_factory=list)
    tables: list[TableRegion] = field(default_factory=list)
    is_native: bool = True  # False for OCR / scanned

    @property
    def text(self) -> str:
        return "\n".join(b.text for b in self.blocks)


# ---------------------------------------------------------------------------
# Semantic label heuristics (used by both layer 2 and layer 3)
# ---------------------------------------------------------------------------


_SEMANTIC_HEADER_PATTERNS: list[tuple[str, list[str]]] = [
    ("BILLING_TABLE", ["period", "from", "to", "units", "amount", "tariff", "consumption"]),
    ("HR_TABLE", ["employee", "emp id", "name", "gender", "designation", "doj"]),
    ("TRAINING_TABLE", ["training", "hours", "topic", "trainees", "program"]),
    ("WASTE_TABLE", ["waste", "category", "quantity", "manifest", "disposal", "tsdf"]),
    ("FUEL_TABLE", ["fuel", "diesel", "petrol", "litres", "qty", "rate"]),
    ("WATER_TABLE", ["water", "source", "withdrawal", "kl", "consumption"]),
    ("CONSUMPTION_SUMMARY", ["total", "summary", "units consumed", "consumed"]),
]


def detect_semantic_label(header_row: list[str]) -> str:
    """Classify a table by its (lower-cased) header row tokens."""
    if not header_row:
        return "GENERIC_TABLE"
    hay = " ".join(h.lower().strip() for h in header_row)
    best_label = "GENERIC_TABLE"
    best_hits = 0
    for label, needles in _SEMANTIC_HEADER_PATTERNS:
        hits = sum(1 for n in needles if n in hay)
        if hits > best_hits:
            best_hits = hits
            best_label = label
    return best_label if best_hits else "GENERIC_TABLE"


# ---------------------------------------------------------------------------
# Layer 2
# ---------------------------------------------------------------------------


class Layer2Layout:
    """Produces ``LayoutPage`` objects from raw bytes / text."""

    async def detect_from_text(self, text: str, *, page_no: int = 1) -> LayoutPage:
        """Layout detection for plain text (used by fixtures + DOCX surrogates)."""
        page = LayoutPage(page_no=page_no, width=612.0, height=792.0, is_native=True)
        blocks, tables = _layout_from_text(text, page_no=page_no)
        page.blocks = blocks
        page.tables = tables
        return page

    async def detect_from_pdf(
        self, data: bytes, *, max_pages: int = 50
    ) -> list[LayoutPage]:
        """Native PDF layout via pdfplumber. Returns one page per PDF page.

        For scan-only PDFs (no embedded text layer — common for utility bills
        printed and rescanned), pdfplumber returns 0 chars per page. We
        rasterize the page via PyMuPDF and OCR it with pytesseract so the
        downstream pipeline still gets real text.
        """
        try:
            import pdfplumber  # type: ignore
        except Exception:  # noqa: BLE001
            logger.warning("layer2.pdfplumber_missing")
            return []
        pages: list[LayoutPage] = []
        try:
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                for i, page in enumerate(pdf.pages[:max_pages], start=1):
                    pages.append(self._page_from_pdfplumber(page, page_no=i))
        except Exception as e:  # noqa: BLE001
            logger.warning("layer2.pdf_failed", err=str(e))

        # If any page came out empty (scan-only PDF), OCR-rasterize ALL pages.
        # Threshold: 25 chars/page average is the noise floor below which we
        # treat the PDF as scanned.
        total_chars = sum(len(p.text or "") for p in pages)
        avg = total_chars / max(1, len(pages))
        if pages and avg < 25:
            ocr_pages = await self._ocr_rasterize_pdf(data, max_pages=max_pages)
            if ocr_pages:
                logger.info(
                    "layer2.pdf_ocr_fallback",
                    native_chars=total_chars,
                    ocr_pages=len(ocr_pages),
                )
                return ocr_pages
        return pages

    async def _ocr_rasterize_pdf(
        self, data: bytes, *, max_pages: int, dpi: int = 300
    ) -> list[LayoutPage]:
        """Rasterize each page via PyMuPDF, OCR with pytesseract."""
        try:
            import fitz  # type: ignore  (PyMuPDF)
            from PIL import Image  # type: ignore
            import pytesseract  # type: ignore
        except Exception as e:  # noqa: BLE001
            logger.warning("layer2.ocr_deps_missing", err=str(e))
            return []
        out: list[LayoutPage] = []
        try:
            doc = fitz.open(stream=data, filetype="pdf")
        except Exception as e:  # noqa: BLE001
            logger.warning("layer2.ocr_open_failed", err=str(e))
            return []
        try:
            zoom = dpi / 72.0
            mat = fitz.Matrix(zoom, zoom)
            # PyMuPDF Document doesn't support slice indexing; use range().
            page_count = min(doc.page_count, max_pages)
            for idx in range(page_count):
                page = doc.load_page(idx)
                i = idx + 1
                try:
                    pix = page.get_pixmap(matrix=mat, alpha=False)
                    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                    # PSM 6 = "Assume a single uniform block of text". Works
                    # well for invoices/bills where the document is one big
                    # block rather than columns. OEM 1 = LSTM only (more
                    # accurate than the legacy Tesseract engine).
                    tess_config = "--oem 1 --psm 6"
                    data_dict = pytesseract.image_to_data(
                        img,
                        output_type=pytesseract.Output.DICT,
                        config=tess_config,
                    )
                    blocks = _ocr_words_to_blocks(data_dict, page_no=i)
                    out.append(
                        LayoutPage(
                            page_no=i,
                            width=float(pix.width),
                            height=float(pix.height),
                            blocks=blocks,
                            is_native=False,
                        )
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning(
                        "layer2.ocr_page_failed", page=i, err=str(e)
                    )
                    out.append(
                        LayoutPage(
                            page_no=i, width=0, height=0, is_native=False
                        )
                    )
        finally:
            doc.close()
        return out

    async def detect_from_image(self, data: bytes, *, page_no: int = 1) -> LayoutPage:
        """OCR layout via pytesseract."""
        try:
            from PIL import Image  # type: ignore
            import pytesseract  # type: ignore
        except Exception:  # noqa: BLE001
            logger.warning("layer2.tesseract_missing")
            return LayoutPage(page_no=page_no, width=0, height=0, is_native=False)
        try:
            img = Image.open(io.BytesIO(data))
        except Exception as e:  # noqa: BLE001
            logger.warning("layer2.image_open_failed", err=str(e))
            return LayoutPage(page_no=page_no, width=0, height=0, is_native=False)
        try:
            data_dict = pytesseract.image_to_data(
                img, output_type=pytesseract.Output.DICT
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("layer2.tesseract_failed", err=str(e))
            return LayoutPage(page_no=page_no, width=img.width, height=img.height, is_native=False)
        blocks = _ocr_words_to_blocks(data_dict, page_no=page_no)
        page = LayoutPage(
            page_no=page_no,
            width=float(img.width),
            height=float(img.height),
            blocks=blocks,
            is_native=False,
        )
        return page

    # ------------------------------------------------------------------
    # PDF helpers
    # ------------------------------------------------------------------
    def _page_from_pdfplumber(self, page, *, page_no: int) -> LayoutPage:  # noqa: ANN001
        try:
            words = page.extract_words(use_text_flow=True, keep_blank_chars=False) or []
        except Exception:  # noqa: BLE001
            words = []
        try:
            tables_raw = page.extract_tables() or []
        except Exception:  # noqa: BLE001
            tables_raw = []
        blocks = _group_words_to_blocks(words, page_no=page_no)
        tables: list[TableRegion] = []
        for raw_t in tables_raw:
            if not raw_t:
                continue
            cleaned = [[(c or "").strip() for c in row] for row in raw_t if row]
            if not cleaned:
                continue
            header = cleaned[0]
            data = cleaned[1:]
            tables.append(
                TableRegion(
                    bbox=BoundingBox(x0=0, y0=0, x1=float(page.width), y1=float(page.height)),
                    header_row=header,
                    data_rows=data,
                    semantic_label=detect_semantic_label(header),
                    page_no=page_no,
                )
            )
        return LayoutPage(
            page_no=page_no,
            width=float(page.width or 612.0),
            height=float(page.height or 792.0),
            blocks=blocks,
            tables=tables,
            is_native=True,
        )


# ---------------------------------------------------------------------------
# pdfplumber word grouping
# ---------------------------------------------------------------------------


def _group_words_to_blocks(words: list[dict], *, page_no: int) -> list[TextBlock]:
    """Group pdfplumber words into line-level text blocks."""
    if not words:
        return []
    # Sort by (top, x0).
    words_sorted = sorted(words, key=lambda w: (round(float(w.get("top", 0)), 1), float(w.get("x0", 0))))
    lines: list[list[dict]] = []
    cur: list[dict] = []
    cur_top = None
    for w in words_sorted:
        top = float(w.get("top", 0))
        if cur_top is None or abs(top - cur_top) < 3.0:
            cur.append(w)
            cur_top = top if cur_top is None else (cur_top + top) / 2
        else:
            lines.append(cur)
            cur = [w]
            cur_top = top
    if cur:
        lines.append(cur)

    blocks: list[TextBlock] = []
    for ln in lines:
        ln_text = " ".join(str(w.get("text", "")).strip() for w in ln if w.get("text"))
        if not ln_text.strip():
            continue
        x0 = min(float(w.get("x0", 0)) for w in ln)
        y0 = min(float(w.get("top", 0)) for w in ln)
        x1 = max(float(w.get("x1", 0)) for w in ln)
        y1 = max(float(w.get("bottom", 0)) for w in ln)
        size = max(
            (float(w.get("bottom", 0)) - float(w.get("top", 0))) for w in ln
        )
        is_header = size > 13.0 or ln_text.isupper() and len(ln_text.split()) <= 8
        is_label = bool(re.match(r"^[A-Z][A-Za-z0-9 \-\(\)/&]+:\s*", ln_text))
        blocks.append(
            TextBlock(
                text=ln_text,
                bbox=BoundingBox(x0=x0, y0=y0, x1=x1, y1=y1),
                font_size_estimate=size,
                is_header=is_header,
                is_label=is_label,
                page_no=page_no,
            )
        )
    return blocks


# ---------------------------------------------------------------------------
# OCR word grouping
# ---------------------------------------------------------------------------


def _ocr_words_to_blocks(data_dict: dict, *, page_no: int) -> list[TextBlock]:
    """Convert ``pytesseract.image_to_data`` dict to TextBlock list grouped by line."""
    n = len(data_dict.get("text", []))
    if not n:
        return []
    # Group by (block_num, par_num, line_num).
    groups: dict[tuple[int, int, int], list[int]] = {}
    for i in range(n):
        txt = (data_dict["text"][i] or "").strip()
        try:
            conf = float(data_dict["conf"][i])
        except (TypeError, ValueError):
            conf = -1.0
        if not txt or conf < 0:
            continue
        key = (
            int(data_dict.get("block_num", [0])[i] or 0),
            int(data_dict.get("par_num", [0])[i] or 0),
            int(data_dict.get("line_num", [0])[i] or 0),
        )
        groups.setdefault(key, []).append(i)

    blocks: list[TextBlock] = []
    for key in sorted(groups.keys()):
        idxs = sorted(groups[key], key=lambda i: int(data_dict["left"][i] or 0))
        words = [(data_dict["text"][i] or "").strip() for i in idxs]
        text = " ".join(w for w in words if w)
        if not text:
            continue
        x0 = min(float(data_dict["left"][i] or 0) for i in idxs)
        y0 = min(float(data_dict["top"][i] or 0) for i in idxs)
        x1 = max(float(data_dict["left"][i] or 0) + float(data_dict["width"][i] or 0) for i in idxs)
        y1 = max(float(data_dict["top"][i] or 0) + float(data_dict["height"][i] or 0) for i in idxs)
        height_est = max(float(data_dict["height"][i] or 0) for i in idxs)
        blocks.append(
            TextBlock(
                text=text,
                bbox=BoundingBox(x0=x0, y0=y0, x1=x1, y1=y1),
                font_size_estimate=height_est,
                is_header=height_est > 22.0 or (text.isupper() and len(text.split()) <= 8),
                is_label=bool(re.match(r"^[A-Z][A-Za-z0-9 \-\(\)/&]+:\s*", text)),
                page_no=page_no,
            )
        )
    return blocks


# ---------------------------------------------------------------------------
# Plain-text layout detector
# ---------------------------------------------------------------------------


_TABLE_SEP_RE = re.compile(r"\s{2,}|\s*\|\s*|\t")


def _layout_from_text(text: str, *, page_no: int) -> tuple[list[TextBlock], list[TableRegion]]:
    """Detect blocks and tables in plain text.

    Heuristics:
      * Lines starting with ``#`` or in ALL CAPS (<=8 words) are headers.
      * A run of >=2 consecutive lines that split into >=2 columns on
        2+ spaces / tab / "|" is treated as a table.
      * Other lines are paragraph blocks.
    """
    lines = (text or "").splitlines()
    blocks: list[TextBlock] = []
    tables: list[TableRegion] = []

    i = 0
    y = 0.0
    line_height = 12.0
    while i < len(lines):
        ln = lines[i].rstrip()
        # Detect a table: this line + next have multiple columns by sep regex.
        if i + 1 < len(lines) and _looks_tabular(ln) and _looks_tabular(lines[i + 1]):
            # Gather contiguous tabular lines.
            t_lines = []
            start_y = y
            while i < len(lines) and _looks_tabular(lines[i]):
                t_lines.append(lines[i])
                i += 1
                y += line_height
            rows = [_split_table_row(t) for t in t_lines]
            if rows:
                header = rows[0]
                data = rows[1:]
                tables.append(
                    TableRegion(
                        bbox=BoundingBox(x0=0, y0=start_y, x1=612.0, y1=y),
                        header_row=header,
                        data_rows=data,
                        semantic_label=detect_semantic_label(header),
                        page_no=page_no,
                    )
                )
            continue

        if not ln.strip():
            i += 1
            y += line_height
            continue

        is_header = (
            ln.startswith("#")
            or (ln.isupper() and 0 < len(ln.split()) <= 8)
            or bool(re.match(r"^={3,}|^-{3,}$", ln))
        )
        is_label = bool(re.match(r"^[A-Z][A-Za-z0-9 \-\(\)/&]+:\s*", ln))
        size = 16.0 if is_header else 10.0
        blocks.append(
            TextBlock(
                text=ln.lstrip("#-* ").strip(),
                bbox=BoundingBox(x0=0, y0=y, x1=612.0, y1=y + line_height),
                font_size_estimate=size,
                is_header=is_header,
                is_label=is_label,
                page_no=page_no,
            )
        )
        i += 1
        y += line_height

    return blocks, tables


def _looks_tabular(line: str) -> bool:
    if not line or not line.strip():
        return False
    if "|" in line and line.count("|") >= 2:
        return True
    cells = _TABLE_SEP_RE.split(line.strip())
    return len([c for c in cells if c]) >= 3 and any("  " in line or "\t" in line for _ in [0])


def _split_table_row(line: str) -> list[str]:
    parts = [p.strip() for p in _TABLE_SEP_RE.split(line.strip())]
    return [p for p in parts if p]
