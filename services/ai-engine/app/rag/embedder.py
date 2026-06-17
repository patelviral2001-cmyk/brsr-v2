"""Embedder — OpenAI text-embedding-3-large primary, BGE local fallback.

The primary path uses OpenAI's ``embeddings.create`` endpoint with the
``OPENAI_MODEL_EMBEDDING`` configured in settings (default
``text-embedding-3-large``). Texts are batched up to 100 per HTTP call (the
practical sweet spot for OpenAI — beyond that the request gets large and
slow without much throughput gain), and each batch is wrapped in a tenacity
retry that backs off on rate-limit and 5xx errors.

If the OpenAI key is missing or persistent errors occur, we fall back to a
local SentenceTransformer (BGE-large) so the rest of the pipeline can keep
running. Vector dimensions differ between providers, so downstream callers
should rely on a fixed collection schema and not mix-and-match.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
)
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("rag.embedder")


# Maximum texts per OpenAI embeddings request. Service limit is higher but
# 100 keeps payloads predictable and matches OpenAI's documented sweet spot.
_OPENAI_BATCH_SIZE = 100


class Embedder:
    """Async embedding gateway with OpenAI primary + BGE local fallback."""

    def __init__(self) -> None:
        self.s = get_settings()
        self._openai_client: AsyncOpenAI | None = None
        self._st_model: Any = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts. Returns one vector per input text."""
        if not texts:
            return []
        if self.s.OPENAI_API_KEY:
            try:
                return await self._embed_openai(texts)
            except Exception as e:  # noqa: BLE001
                logger.warning("embedder.openai_failed_fallback_bge", err=str(e))
        return await self._embed_bge(texts)

    # ------------------------------------------------------------------
    # OpenAI path
    # ------------------------------------------------------------------
    def _get_openai_client(self) -> AsyncOpenAI:
        if self._openai_client is None:
            client_kwargs: dict[str, Any] = {
                "api_key": self.s.OPENAI_API_KEY,
                "timeout": float(self.s.EXTRACTION_TIMEOUT_SECONDS),
                "max_retries": 0,  # we manage retries with tenacity
            }
            if self.s.OPENAI_BASE_URL:
                client_kwargs["base_url"] = self.s.OPENAI_BASE_URL
            if self.s.OPENAI_ORG_ID:
                client_kwargs["organization"] = self.s.OPENAI_ORG_ID
            if self.s.OPENAI_PROJECT_ID:
                client_kwargs["project"] = self.s.OPENAI_PROJECT_ID
            self._openai_client = AsyncOpenAI(**client_kwargs)
        return self._openai_client

    async def _embed_openai(self, texts: list[str]) -> list[list[float]]:
        client = self._get_openai_client()
        model = self.s.OPENAI_MODEL_EMBEDDING or self.s.EMBEDDING_MODEL_PRIMARY
        out: list[list[float]] = []
        for batch in _batches(texts, _OPENAI_BATCH_SIZE):
            cleaned = [t if t else " " for t in batch]  # OpenAI rejects empty strings
            vecs = await self._embed_batch_with_retry(client, model, cleaned)
            out.extend(vecs)
        return out

    async def _embed_batch_with_retry(
        self,
        client: AsyncOpenAI,
        model: str,
        batch: list[str],
    ) -> list[list[float]]:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=0.5, min=0.5, max=8.0),
            retry=retry_if_exception_type(
                (
                    RateLimitError,
                    APITimeoutError,
                    APIConnectionError,
                    InternalServerError,
                )
            ),
            reraise=True,
        ):
            with attempt:
                resp = await client.embeddings.create(model=model, input=batch)
                return [list(item.embedding) for item in resp.data]
        # Unreachable — AsyncRetrying(reraise=True) propagates the last error.
        raise RuntimeError("unreachable")

    # ------------------------------------------------------------------
    # Local BGE fallback
    # ------------------------------------------------------------------
    async def _embed_bge(self, texts: list[str]) -> list[list[float]]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_bge, texts)

    def _sync_bge(self, texts: list[str]) -> list[list[float]]:
        if self._st_model is None:
            from sentence_transformers import SentenceTransformer

            self._st_model = SentenceTransformer(self.s.EMBEDDING_MODEL_FALLBACK)
        vecs = self._st_model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [list(map(float, v)) for v in vecs]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _batches(lst: list[str], n: int) -> list[list[str]]:
    return [lst[i : i + n] for i in range(0, len(lst), n)]


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    return Embedder()


# Backward-compat: APIStatusError isn't used directly above but is part of the
# documented "retryable" surface. Keep the import alive so static analysers
# don't flag it; the constant is harmless and self-documenting.
_RETRYABLE_API_STATUS = APIStatusError
