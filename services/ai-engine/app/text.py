"""Document → text. PDF native first, OCR fallback for scans, raw decode for CSV/XLSX."""
from __future__ import annotations
import io
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


def extract_text_from_pdf(data: bytes) -> Tuple[str, bool]:
    """Returns (text, ocr_applied)."""
    text = ""
    ocr_applied = False
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            parts = []
            for p in pdf.pages[:50]:
                t = p.extract_text() or ""
                parts.append(t)
            text = "\n".join(parts).strip()
    except Exception as e:
        logger.warning("pdfplumber failed: %s", e)

    # OCR fallback if native text is sparse
    if len(text) < 200:
        try:
            import fitz                                  # PyMuPDF
            from PIL import Image                        # noqa
            import pytesseract
            doc = fitz.open(stream=data, filetype="pdf")
            pages = []
            mat = fitz.Matrix(300 / 72.0, 300 / 72.0)
            for i in range(min(doc.page_count, 25)):
                page = doc.load_page(i)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                ocr_text = pytesseract.image_to_string(img, config="--oem 1 --psm 6")
                pages.append(ocr_text)
            doc.close()
            ocr_text_joined = "\n".join(pages).strip()
            if len(ocr_text_joined) > len(text):
                text = ocr_text_joined
                ocr_applied = True
        except Exception as e:
            logger.warning("OCR fallback failed: %s", e)

    return text, ocr_applied


def extract_text_from_image(data: bytes) -> str:
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(io.BytesIO(data)).convert("RGB")
        return pytesseract.image_to_string(img, config="--oem 1 --psm 6")
    except Exception as e:
        logger.warning("image OCR failed: %s", e)
        return ""


def extract_text_from_csv(data: bytes) -> str:
    try:
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def extract_text_from_xlsx(data: bytes) -> str:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
        out = []
        for sheet in wb.worksheets[:5]:
            for row in sheet.iter_rows(max_row=200, values_only=True):
                out.append(",".join("" if v is None else str(v) for v in row))
        return "\n".join(out)
    except Exception as e:
        logger.warning("xlsx parse failed: %s", e)
        return ""


def text_from_bytes(data: bytes, mime: str, filename: str = "") -> Tuple[str, bool]:
    mime = (mime or "").lower()
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if "pdf" in mime or ext == "pdf":
        return extract_text_from_pdf(data)
    if "image" in mime or ext in ("png", "jpg", "jpeg"):
        return extract_text_from_image(data), True
    if "csv" in mime or ext == "csv":
        return extract_text_from_csv(data), False
    if "sheet" in mime or "excel" in mime or ext in ("xlsx", "xls"):
        return extract_text_from_xlsx(data), False
    # Last resort
    try:
        return data.decode("utf-8", errors="ignore"), False
    except Exception:
        return "", False
