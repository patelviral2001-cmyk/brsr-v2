"""RAG indexer — fire-and-forget after successful extraction.

Pipeline:
  bytes → chunker → embedder → Qdrant upsert

Triggered by the orchestrator with `asyncio.create_task` so it never blocks the
extraction response.
"""
from __future__ import annotations

import uuid
from typing import Optional

from app.rag.chunker import SemanticChunker
from app.rag.embedder import get_embedder
from app.rag.vector_store import Point, VectorStore
from app.utils.logging import get_logger

logger = get_logger("rag.indexer")


class RagIndexer:
    def __init__(self, vector_store: Optional[VectorStore] = None) -> None:
        self.chunker = SemanticChunker()
        self.embedder = get_embedder()
        self.vstore = vector_store or VectorStore()

    async def index_document(
        self,
        *,
        tenant_id: str,
        doc_id: str,
        filename: str,
        data: bytes,
    ) -> int:
        try:
            chunks = await self.chunker.chunk_bytes(
                doc_id=doc_id, tenant_id=tenant_id, filename=filename, data=data
            )
            if not chunks:
                logger.info("rag.no_chunks", doc_id=doc_id)
                return 0
            texts = [c.text for c in chunks]
            vectors = await self.embedder.embed(texts)
            points = [
                Point(
                    id=_uuid_for(c.chunk_id),
                    vector=v,
                    payload={
                        "doc_id": c.doc_id,
                        "chunk_id": c.chunk_id,
                        "page": c.page,
                        "section_title": c.section_title,
                        "text": c.text,
                    },
                )
                for c, v in zip(chunks, vectors)
            ]
            await self.vstore.upsert(tenant_id, points)
            logger.info("rag.indexed", doc_id=doc_id, chunks=len(points))
            return len(points)
        except Exception as e:  # noqa: BLE001
            logger.error("rag.index_failed", doc_id=doc_id, err=str(e))
            return 0


def _uuid_for(chunk_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, chunk_id))
