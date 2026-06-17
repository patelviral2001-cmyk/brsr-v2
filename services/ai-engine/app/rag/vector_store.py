"""Qdrant vector store wrapper.

Uses **collection-per-tenant** pattern: every tenant gets `t_{tenant_id_hash}` as
its own collection. Payloads also include `tenant_id` so queries that span
collections (admin / cross-tenant analytics) still enforce isolation via filter.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("rag.vector_store")


def _tenant_collection(tenant_id: str) -> str:
    h = hashlib.sha256(tenant_id.encode()).hexdigest()[:16]
    return f"t_{h}"


@dataclass
class Point:
    id: str | int
    vector: list[float]
    payload: dict[str, Any]


class VectorStore:
    def __init__(self, client: Optional[AsyncQdrantClient] = None) -> None:
        self.s = get_settings()
        self.client = client or AsyncQdrantClient(
            url=self.s.QDRANT_URL,
            api_key=self.s.QDRANT_API_KEY or None,
        )
        self._known_collections: set[str] = set()

    async def ensure_collection(self, tenant_id: str, vector_size: int) -> str:
        name = _tenant_collection(tenant_id)
        if name in self._known_collections:
            return name
        try:
            await self.client.get_collection(name)
        except Exception:
            await self.client.create_collection(
                collection_name=name,
                vectors_config=qmodels.VectorParams(
                    size=vector_size,
                    distance=qmodels.Distance.COSINE,
                ),
            )
            # Useful payload indexes
            for field, schema in [
                ("tenant_id", qmodels.PayloadSchemaType.KEYWORD),
                ("doc_id", qmodels.PayloadSchemaType.KEYWORD),
                ("page", qmodels.PayloadSchemaType.INTEGER),
            ]:
                try:
                    await self.client.create_payload_index(
                        collection_name=name, field_name=field, field_schema=schema
                    )
                except Exception:
                    pass
        self._known_collections.add(name)
        return name

    async def upsert(self, tenant_id: str, points: list[Point]) -> None:
        if not points:
            return
        name = await self.ensure_collection(tenant_id, vector_size=len(points[0].vector))
        qpoints = [
            qmodels.PointStruct(
                id=p.id,
                vector=p.vector,
                payload={**p.payload, "tenant_id": tenant_id},
            )
            for p in points
        ]
        await self.client.upsert(collection_name=name, points=qpoints)
        logger.info("qdrant.upsert", tenant_collection=name, points=len(points))

    async def search(
        self,
        tenant_id: str,
        query_vector: list[float],
        *,
        limit: int = 8,
        filter_extra: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        name = _tenant_collection(tenant_id)
        must: list[qmodels.FieldCondition] = [
            qmodels.FieldCondition(key="tenant_id", match=qmodels.MatchValue(value=tenant_id))
        ]
        if filter_extra:
            for k, v in filter_extra.items():
                must.append(qmodels.FieldCondition(key=k, match=qmodels.MatchValue(value=v)))
        results = await self.client.search(
            collection_name=name,
            query_vector=query_vector,
            limit=limit,
            query_filter=qmodels.Filter(must=must),
        )
        return [
            {
                "id": r.id,
                "score": r.score,
                "payload": r.payload,
            }
            for r in results
        ]
