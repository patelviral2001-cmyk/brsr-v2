"""
Qdrant wrapper, per-tenant collection.

We use one collection per tenant so deletes / GDPR exports are simple.
Collections are auto-created on first upsert.

Embeddings are generated with OpenAI's text-embedding-3-large (3072 dim).
"""
from __future__ import annotations

import asyncio
from typing import Any

import structlog
from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.http.models import Distance, Filter, FieldCondition, MatchValue, PointStruct, VectorParams

from app.config import Settings, get_settings


log = structlog.get_logger("copilot.rag.vector_store")

_QDRANT: AsyncQdrantClient | None = None
_OPENAI: AsyncOpenAI | None = None
_EMBED_DIM = 3072
_EMBED_MODEL = "text-embedding-3-large"

_KNOWN_COLLECTIONS: set[str] = set()
_COLLECTION_LOCK = asyncio.Lock()


def _collection(tenant_id: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in tenant_id)
    return f"copilot_docs__{safe}"


async def init_vector_store(settings: Settings) -> None:
    global _QDRANT, _OPENAI, _EMBED_MODEL
    _EMBED_MODEL = settings.openai_embedding_model
    _QDRANT = AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
        prefer_grpc=False,
        timeout=10,
    )
    _OPENAI = AsyncOpenAI(api_key=settings.openai_api_key)


async def close_vector_store() -> None:
    global _QDRANT, _OPENAI
    if _QDRANT is not None:
        await _QDRANT.close()
        _QDRANT = None
    _OPENAI = None


async def vector_store_ready() -> bool:
    if _QDRANT is None:
        return False
    try:
        await _QDRANT.get_collections()
        return True
    except Exception:
        return False


class VectorStore:
    async def _ensure_collection(self, name: str) -> None:
        assert _QDRANT is not None
        if name in _KNOWN_COLLECTIONS:
            return
        async with _COLLECTION_LOCK:
            if name in _KNOWN_COLLECTIONS:
                return
            try:
                await _QDRANT.get_collection(name)
            except (UnexpectedResponse, ValueError):
                await _QDRANT.create_collection(
                    collection_name=name,
                    vectors_config=VectorParams(size=_EMBED_DIM, distance=Distance.COSINE),
                )
                log.info("vector_store.collection_created", name=name)
            _KNOWN_COLLECTIONS.add(name)

    async def upsert(self, *, tenant_id: str, points: list[dict[str, Any]]) -> None:
        assert _QDRANT is not None and _OPENAI is not None
        collection = _collection(tenant_id)
        await self._ensure_collection(collection)

        texts = [p["text"] for p in points]
        vectors = await self._embed(texts)

        structs: list[PointStruct] = []
        for p, vec in zip(points, vectors, strict=True):
            structs.append(
                PointStruct(
                    id=_stable_id(p["id"]),
                    vector=vec,
                    payload={"text": p["text"], **p["metadata"]},
                )
            )
        await _QDRANT.upsert(collection_name=collection, points=structs)

    async def search(
        self,
        *,
        tenant_id: str,
        query: str,
        top_k: int = 6,
        filter_document_type: str | None = None,
    ) -> list[dict[str, Any]]:
        assert _QDRANT is not None and _OPENAI is not None
        collection = _collection(tenant_id)
        if collection not in _KNOWN_COLLECTIONS:
            try:
                await _QDRANT.get_collection(collection)
                _KNOWN_COLLECTIONS.add(collection)
            except Exception:
                return []
        [vec] = await self._embed([query])
        qfilter: Filter | None = None
        if filter_document_type:
            qfilter = Filter(
                must=[
                    FieldCondition(
                        key="document_type", match=MatchValue(value=filter_document_type)
                    )
                ]
            )
        hits = await _QDRANT.search(
            collection_name=collection,
            query_vector=vec,
            limit=top_k,
            query_filter=qfilter,
            with_payload=True,
        )
        out: list[dict[str, Any]] = []
        for h in hits:
            payload = dict(h.payload or {})
            payload["score"] = float(h.score)
            out.append(payload)
        return out

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        assert _OPENAI is not None
        resp = await _OPENAI.embeddings.create(model=_EMBED_MODEL, input=texts)
        return [d.embedding for d in resp.data]


def get_vector_store() -> VectorStore:
    if _QDRANT is None:
        raise RuntimeError("vector store not initialised")
    return VectorStore()


def _stable_id(point_id: str) -> int:
    """Qdrant requires uint64 or UUID. Hash strings deterministically to uint64."""
    import hashlib

    h = hashlib.sha256(point_id.encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big", signed=False)
