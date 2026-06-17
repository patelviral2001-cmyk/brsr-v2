"""Image extractor — preprocess and OCR a single page."""
from __future__ import annotations

import asyncio
import io

from PIL import Image, ImageFilter, ImageOps

from app.extractors.base import BaseExtractor, ExtractionContext, ExtractionResult
from app.extractors.pdf_ocr import _preprocess
from app.models.internal import ChunkKind, DocumentChunk
from app.models.responses import BoundingBox
from app.utils.logging import get_logger

logger = get_logger("extractors.image")


class ImageExtractor(BaseExtractor):
    name = "image"

    async def extract(self, ctx: ExtractionContext) -> ExtractionResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_extract, ctx)

    def _sync_extract(self, ctx: ExtractionContext) -> ExtractionResult:
        import pytesseract

        result = ExtractionResult()
        try:
            img = Image.open(io.BytesIO(ctx.file_bytes))
            img = _preprocess(img)
            ocr_lang = "eng" if ctx.locale.startswith("en") else ctx.locale.replace("-", "_")
            data = pytesseract.image_to_data(img, lang=ocr_lang, output_type=pytesseract.Output.DICT)
            words = [(data["text"][i] or "").strip() for i in range(len(data["text"]))]
            text = " ".join(w for w in words if w)
            if text.strip():
                result.chunks.append(
                    DocumentChunk(
                        chunk_id=self._chunk_id("img", 1, 1),
                        page=1,
                        text=text,
                        kind=ChunkKind.PARAGRAPH,
                        bbox=BoundingBox(x0=0, y0=0, x1=float(img.width), y1=float(img.height)),
                        meta={"source": self.name, "engine": "tesseract"},
                    )
                )
            result.page_count = 1
            result.text_preview = text[:2000]
        except Exception as e:  # noqa: BLE001
            logger.error("image.extract_failed", err=str(e))
            result.notes.append(f"image OCR failed: {e}")
        return result
