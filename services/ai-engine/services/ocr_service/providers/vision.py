"""Google Vision OCR adapter — FALLBACK when Document AI is unavailable.

Vision gives full-text + blocks/paragraphs/words/symbols with confidence and
bounding boxes, but no tables / form key-values. Maps to `NormalizedLayout`; the
downstream native text harvester derives key-values generically.
"""
from __future__ import annotations

import os
from typing import Optional

from .base import BBox, Block, NormalizedLayout, OcrSource, Page, Token

try:                                              # pragma: no cover - env dependent
    from google.cloud import vision
    _LIB = True
except Exception:
    vision = None                                 # type: ignore
    _LIB = False


class VisionProvider:
    name = "vision"

    def available(self) -> bool:
        return bool(_LIB and os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))

    def supports(self, mime: str, filename: str, data: bytes) -> bool:
        return self.available()

    def extract(self, data: bytes, mime: str, filename: str = "") -> NormalizedLayout:
        if not self.available():
            raise RuntimeError("Vision not configured (lib/creds missing)")
        client = vision.ImageAnnotatorClient()
        image = vision.Image(content=data)
        resp = client.document_text_detection(image=image)
        if resp.error.message:
            raise RuntimeError(f"Vision error: {resp.error.message}")
        ann = resp.full_text_annotation
        pages: list[Page] = []
        confs: list[float] = []
        for pno, page in enumerate(ann.pages, start=1):
            tokens: list[Token] = []
            blocks: list[Block] = []
            for block in page.blocks:
                btxt = []
                for para in block.paragraphs:
                    for word in para.words:
                        wtext = "".join(s.text for s in word.symbols)
                        c = float(word.confidence or 0.0)
                        confs.append(c)
                        tokens.append(Token(text=wtext, confidence=c))
                        btxt.append(wtext)
                blocks.append(Block(text=" ".join(btxt),
                                    confidence=float(block.confidence or 0.0)))
            pages.append(Page(number=pno, blocks=blocks, tokens=tokens))
        mean = round(sum(confs) / len(confs), 4) if confs else None
        return NormalizedLayout(source=OcrSource.VISION, text=ann.text, pages=pages,
                                mean_word_confidence=mean, provider_meta={})
