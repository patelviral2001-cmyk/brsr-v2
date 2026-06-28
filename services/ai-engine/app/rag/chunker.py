"""Semantic chunking via Unstructured.io's by_title strategy.

For PDFs / Office docs, we use Unstructured's partition + chunk pipeline.
For plain text we fall back to a sliding-window strategy.

Each emitted chunk carries metadata: doc_id, page, section_title.
"""
from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class RAGChunk:
    chunk_id: str
    text: str
    doc_id: str
    tenant_id: str
    page: Optional[int] = None
    section_title: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)


class SemanticChunker:
    def __init__(self, *, max_chars: int = 2000, overlap_chars: int = 200) -> None:
        self.max_chars = max_chars
        self.overlap_chars = overlap_chars

    async def chunk_bytes(
        self,
        *,
        doc_id: str,
        tenant_id: str,
        filename: str,
        data: bytes,
    ) -> list[RAGChunk]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_chunk_bytes, doc_id, tenant_id, filename, data)

    def _sync_chunk_bytes(
        self,
        doc_id: str,
        tenant_id: str,
        filename: str,
        data: bytes,
    ) -> list[RAGChunk]:
        try:
            from unstructured.chunking.title import chunk_by_title
            from unstructured.partition.auto import partition
        except Exception:
            return self.chunk_text(text=data.decode("utf-8", errors="ignore"), doc_id=doc_id, tenant_id=tenant_id)

        try:
            elements = partition(file=io.BytesIO(data), file_filename=filename)
            chunks = chunk_by_title(
                elements,
                max_characters=self.max_chars,
                new_after_n_chars=int(self.max_chars * 0.85),
                overlap=self.overlap_chars,
                combine_text_under_n_chars=400,
            )
        except Exception:
            return self.chunk_text(text=data.decode("utf-8", errors="ignore"), doc_id=doc_id, tenant_id=tenant_id)

        out: list[RAGChunk] = []
        for i, c in enumerate(chunks):
            meta = getattr(c, "metadata", None)
            page = getattr(meta, "page_number", None) if meta else None
            section = getattr(meta, "section", None) if meta else None
            if not section and meta is not None:
                section = getattr(meta, "filename", None)
            text = (c.text or "").strip()
            if not text:
                continue
            out.append(
                RAGChunk(
                    chunk_id=f"{doc_id}-rag-{i:05d}",
                    text=text,
                    doc_id=doc_id,
                    tenant_id=tenant_id,
                    page=page,
                    section_title=section,
                    extra={"category": getattr(c, "category", None)},
                )
            )
        return out

    def chunk_text(
        self,
        *,
        text: str,
        doc_id: str,
        tenant_id: str,
        page: Optional[int] = None,
        section_title: Optional[str] = None,
    ) -> list[RAGChunk]:
        if not text:
            return []
        out: list[RAGChunk] = []
        step = self.max_chars - self.overlap_chars
        for i, start in enumerate(range(0, len(text), step)):
            piece = text[start : start + self.max_chars]
            piece = piece.strip()
            if not piece:
                continue
            out.append(
                RAGChunk(
                    chunk_id=f"{doc_id}-rag-{i:05d}",
                    text=piece,
                    doc_id=doc_id,
                    tenant_id=tenant_id,
                    page=page,
                    section_title=section_title,
                )
            )
        return out
