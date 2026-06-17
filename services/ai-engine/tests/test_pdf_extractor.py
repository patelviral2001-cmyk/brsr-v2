"""PDF native extractor against a synthesised PDF fixture."""
from __future__ import annotations

import pytest

from app.extractors.base import ExtractionContext
from app.extractors.pdf_native import PdfNativeExtractor


async def test_pdf_extracts_text_and_pages(sample_pdf_bytes):
    ext = PdfNativeExtractor()
    ctx = ExtractionContext(
        file_id="f1", tenant_id="t1", filename="acme.pdf", file_bytes=sample_pdf_bytes
    )
    result = await ext.extract(ctx)
    assert result.page_count >= 1
    full_text = "\n".join(c.text for c in result.chunks)
    assert "Acme Corp" in full_text
    assert "12,345" in full_text or "12345" in full_text
    assert "kWh" in full_text
    assert "FY 2024-25" in full_text


async def test_pdf_text_preview_populated(sample_pdf_bytes):
    ext = PdfNativeExtractor()
    ctx = ExtractionContext(
        file_id="f", tenant_id="t", filename="acme.pdf", file_bytes=sample_pdf_bytes
    )
    result = await ext.extract(ctx)
    assert result.text_preview
    assert len(result.text_preview) <= 2000


async def test_pdf_empty_bytes_safe():
    ext = PdfNativeExtractor()
    ctx = ExtractionContext(
        file_id="f", tenant_id="t", filename="empty.pdf", file_bytes=b""
    )
    result = await ext.extract(ctx)
    assert result.page_count == 0
    assert result.notes  # captured the error
