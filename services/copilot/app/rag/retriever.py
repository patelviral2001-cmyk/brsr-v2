"""
Hybrid retriever: BM25 + dense + cross-encoder reranker.

Process:
  1) Pull `wide_k` candidates from the dense vector store.
  2) In parallel, score the same candidate pool with BM25 over their raw text.
  3) Re-rank with a cross-encoder using Claude as judge (cheap Haiku call,
     returns relevance score 0-1). We batch the rerank in one prompt with
     numbered candidates to keep cost down.
  4) Return the top `top_k` after reranking.

The cross-encoder step is gated by a cheap heuristic: skip if the dense top-k
are already tightly scored (no need to spend tokens).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import structlog
from anthropic import AsyncAnthropic
from rank_bm25 import BM25Okapi

from app.config import get_settings
from app.rag.vector_store import get_vector_store


log = structlog.get_logger("copilot.rag.retriever")


@dataclass(slots=True)
class RetrievedChunk:
    text: str
    document_id: str
    title: str
    chunk_index: int
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "document_id": self.document_id,
            "title": self.title,
            "chunk_index": self.chunk_index,
            "score": self.score,
            "metadata": self.metadata,
        }


def _tokenize(text: str) -> list[str]:
    return [t for t in text.lower().split() if t.isalnum()]


class HybridRetriever:
    """BM25 + dense + LLM rerank."""

    def __init__(self, wide_k: int = 20) -> None:
        self.wide_k = wide_k
        self.settings = get_settings()
        self.anthropic = AsyncAnthropic(api_key=self.settings.anthropic_api_key)

    async def retrieve(
        self,
        *,
        tenant_id: str,
        query: str,
        top_k: int = 6,
        filter_document_type: str | None = None,
    ) -> list[RetrievedChunk]:
        store = get_vector_store()
        candidates = await store.search(
            tenant_id=tenant_id,
            query=query,
            top_k=self.wide_k,
            filter_document_type=filter_document_type,
        )
        if not candidates:
            return []

        # ---- BM25 rescoring
        corpus = [_tokenize(c.get("text", "")) for c in candidates]
        bm25 = BM25Okapi(corpus) if corpus else None
        bm25_scores = bm25.get_scores(_tokenize(query)) if bm25 else [0.0] * len(candidates)
        max_bm25 = max(bm25_scores) if bm25_scores else 1.0
        norm_bm25 = [s / max_bm25 if max_bm25 > 0 else 0.0 for s in bm25_scores]

        # ---- Blend dense + bm25 (0.6 dense, 0.4 bm25)
        blended: list[tuple[int, float]] = []
        for i, c in enumerate(candidates):
            dense = float(c.get("score", 0.0))
            blended.append((i, 0.6 * dense + 0.4 * norm_bm25[i]))
        blended.sort(key=lambda x: x[1], reverse=True)

        narrowed_idx = [i for i, _ in blended[: max(top_k * 2, top_k)]]

        # ---- LLM rerank (skip if top scores are tightly clustered)
        if len(narrowed_idx) > top_k and self._needs_rerank([blended[j][1] for j in range(len(narrowed_idx))]):
            try:
                narrowed_idx = await self._llm_rerank(query, candidates, narrowed_idx, top_k)
            except Exception:
                log.exception("rerank_failed")  # fall back to blended order

        out: list[RetrievedChunk] = []
        for idx in narrowed_idx[:top_k]:
            c = candidates[idx]
            score = next((b for i, b in blended if i == idx), 0.0)
            out.append(
                RetrievedChunk(
                    text=c.get("text", ""),
                    document_id=c.get("document_id", ""),
                    title=c.get("title", ""),
                    chunk_index=int(c.get("chunk_index", 0)),
                    score=score,
                    metadata={
                        k: v
                        for k, v in c.items()
                        if k not in {"text", "document_id", "title", "chunk_index", "score"}
                    },
                )
            )
        return out

    def _needs_rerank(self, scores: list[float]) -> bool:
        """Skip the LLM call when the top scores are clearly separated."""
        if len(scores) < 2:
            return False
        return (scores[0] - scores[-1]) < 0.15

    async def _llm_rerank(
        self,
        query: str,
        candidates: list[dict[str, Any]],
        narrowed_idx: list[int],
        top_k: int,
    ) -> list[int]:
        numbered = "\n".join(
            f"[{i}] {candidates[idx].get('title', '?')} :: {candidates[idx].get('text', '')[:400]}"
            for i, idx in enumerate(narrowed_idx)
        )
        prompt = (
            f"Query: {query}\n\nCandidates:\n{numbered}\n\n"
            f"Return the top {top_k} candidate indices ranked by relevance to the query, "
            "as a comma-separated list of integers (most relevant first). Output ONLY the list."
        )
        resp = await self.anthropic.messages.create(
            model=self.settings.anthropic_fast_model,
            max_tokens=80,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
        text = ""
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                text = block.text
                break
        ordered_local: list[int] = []
        for tok in text.replace("\n", ",").split(","):
            tok = tok.strip().strip("[]")
            if tok.isdigit():
                local = int(tok)
                if 0 <= local < len(narrowed_idx):
                    ordered_local.append(local)
        # Map local positions back to candidate indices, and append any missed.
        ordered_global: list[int] = []
        seen: set[int] = set()
        for local in ordered_local:
            g = narrowed_idx[local]
            if g not in seen:
                ordered_global.append(g)
                seen.add(g)
        for g in narrowed_idx:
            if g not in seen:
                ordered_global.append(g)
        return ordered_global
