"""OCR provider registry + router.

Routing policy (matches the UEDI pipeline diagram):
  native PDF with a real text layer   → NativePdfProvider   (no cloud, free)
  else, Document AI configured         → DocumentAIProvider  (primary OCR)
  else, Vision configured              → VisionProvider      (fallback OCR)
The choice is logged in provider_meta so every document records which OCR ran.
"""
from __future__ import annotations

from .base import NormalizedLayout, OcrSource
from .native_pdf import NativePdfProvider
from .document_ai import DocumentAIProvider
from .vision import VisionProvider


class OCRRouter:
    def __init__(self):
        self.native = NativePdfProvider()
        self.document_ai = DocumentAIProvider()
        self.vision = VisionProvider()

    def select(self, data: bytes, mime: str, filename: str = "") -> str:
        if self.native.supports(mime, filename, data):
            return "native_pdf"
        if self.document_ai.available():
            return "document_ai"
        if self.vision.available():
            return "vision"
        # last resort: native harvester on whatever text decodes
        return "native_pdf"

    def extract(self, data: bytes, mime: str, filename: str = "") -> NormalizedLayout:
        choice = self.select(data, mime, filename)
        provider = getattr(self, choice if choice != "native_pdf" else "native")
        layout = provider.extract(data, mime, filename)
        layout.provider_meta["router_choice"] = choice
        return layout


__all__ = ["OCRRouter", "NativePdfProvider", "DocumentAIProvider", "VisionProvider",
           "NormalizedLayout", "OcrSource"]
