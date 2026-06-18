"""ValidationContext + loader.

Carries everything a declarative rule needs in one immutable bundle:

  * ``field_by_key``    — same-document fields keyed by canonical_key.
  * ``priors_by_key``   — historical numeric series (most-recent first) for
                          each canonical_key.
  * ``constraints_by_key`` — registry value_constraints for each key.
  * ``doc_type``        — classifier's verdict.
  * ``industry_hint``   — tenant industry (used by sector-aware rules).
  * ``aux_numbers``     — opportunistic extras (e.g. electricity_cost_inr
                          pulled from the raw text, parallel to the metric).
  * ``today``           — clock injection for deterministic tests.

The loader pulls the historical / registry pieces via the Node backend,
cached for 5 minutes per ``(tenant, canonical_key)`` in Redis.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.models.responses import ExtractedField
from app.registry import get_metric
from app.utils.logging import get_logger

logger = get_logger("validation.context")


_CACHE_TTL_SECONDS = 300  # 5 minutes per task spec


@dataclass
class ValidationContext:
    """Bundle of everything a rule needs. Immutable from rule POV."""

    field_by_key: dict[str, ExtractedField] = field(default_factory=dict)
    priors_by_key: dict[str, list[float]] = field(default_factory=dict)
    constraints_by_key: dict[str, dict[str, Any]] = field(default_factory=dict)
    doc_type: Optional[str] = None
    industry_hint: Optional[str] = None
    tenant_id: Optional[str] = None
    aux_numbers: dict[str, float] = field(default_factory=dict)
    today: dt.date = field(default_factory=lambda: dt.date.today())

    # ------------------------------------------------------------------
    # Helpers used by tests + rules
    # ------------------------------------------------------------------
    @classmethod
    def from_fields(
        cls,
        fields: list[ExtractedField],
        *,
        doc_type: Optional[str] = None,
        priors_by_key: Optional[dict[str, list[float]]] = None,
        industry_hint: Optional[str] = None,
        tenant_id: Optional[str] = None,
        aux_numbers: Optional[dict[str, float]] = None,
        today: Optional[dt.date] = None,
    ) -> "ValidationContext":
        """Build an in-memory context from already-extracted fields.

        The orchestrator uses this directly when historical / registry data
        has already been loaded; tests use it to skip the backend round-trip.
        """
        by_key: dict[str, ExtractedField] = {}
        for f in fields:
            # Keep the highest-confidence per key when duplicates exist.
            existing = by_key.get(f.canonical_key)
            if existing is None or f.confidence_composite > existing.confidence_composite:
                by_key[f.canonical_key] = f
        constraints: dict[str, dict[str, Any]] = {}
        for k in by_key:
            m = get_metric(k)
            if m and m.get("value_constraints"):
                constraints[k] = dict(m["value_constraints"])
        return cls(
            field_by_key=by_key,
            priors_by_key=priors_by_key or {},
            constraints_by_key=constraints,
            doc_type=doc_type,
            industry_hint=industry_hint,
            tenant_id=tenant_id,
            aux_numbers=aux_numbers or {},
            today=today or dt.date.today(),
        )


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


class ValidationContextLoader:
    """Fetch + assemble ValidationContext for a tenant + extraction batch.

    Uses Redis as an opportunistic 5-minute cache keyed by
    ``vctx:{tenant}:{canonical_key}``. Failures are non-fatal — we degrade
    to an empty priors list rather than blocking validation.
    """

    def __init__(
        self,
        *,
        redis: Any = None,
        http_client: Optional[httpx.AsyncClient] = None,
        backend_url: Optional[str] = None,
    ) -> None:
        self.redis = redis
        self._http_client = http_client
        self.backend_url = backend_url or get_settings().BACKEND_URL.rstrip("/")
        self._timeout = httpx.Timeout(connect=2.0, read=4.0, write=4.0, pool=4.0)

    async def load(
        self,
        *,
        tenant_id: str,
        fields: list[ExtractedField],
        scope_node_id: Optional[str] = None,
        doc_type: Optional[str] = None,
        industry_hint: Optional[str] = None,
        aux_numbers: Optional[dict[str, float]] = None,
        today: Optional[dt.date] = None,
    ) -> ValidationContext:
        keys = sorted({f.canonical_key for f in fields})
        priors: dict[str, list[float]] = {}
        if keys:
            tasks = [
                self._priors_for_key(tenant_id, k, scope_node_id=scope_node_id) for k in keys
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for key, res in zip(keys, results):
                if isinstance(res, Exception):
                    logger.warning(
                        "validation.context.priors_fetch_failed",
                        key=key,
                        err=str(res),
                    )
                    priors[key] = []
                else:
                    priors[key] = res
        ctx = ValidationContext.from_fields(
            fields,
            doc_type=doc_type,
            priors_by_key=priors,
            industry_hint=industry_hint,
            tenant_id=tenant_id,
            aux_numbers=aux_numbers,
            today=today,
        )
        return ctx

    # ------------------------------------------------------------------
    # Per-key backend lookup w/ Redis cache
    # ------------------------------------------------------------------
    async def _priors_for_key(
        self,
        tenant_id: str,
        canonical_key: str,
        *,
        scope_node_id: Optional[str] = None,
    ) -> list[float]:
        cache_key = f"vctx:{tenant_id}:{canonical_key}:{scope_node_id or 'global'}"
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.backend_url}/metrics/events"
        params: dict[str, Any] = {"canonicalKey": canonical_key, "limit": 8}
        if scope_node_id:
            params["scopeNodeId"] = scope_node_id
        try:
            client = self._http_client or httpx.AsyncClient(timeout=self._timeout)
            should_close = self._http_client is None
            try:
                resp = await client.get(
                    url,
                    params=params,
                    headers={
                        "x-internal-secret": get_settings().BACKEND_CALLBACK_SECRET,
                        "x-tenant-id": tenant_id,
                    },
                )
                resp.raise_for_status()
                payload = resp.json() or {}
            finally:
                if should_close:
                    await client.aclose()
        except Exception as exc:  # noqa: BLE001 — backend down should not block validation
            logger.warning(
                "validation.context.backend_fetch_failed",
                key=canonical_key,
                err=str(exc),
            )
            return []
        series = _extract_numeric_series(payload)
        await self._cache_set(cache_key, series)
        return series

    async def _cache_get(self, key: str) -> Optional[list[float]]:
        if self.redis is None:
            return None
        try:
            raw = await self.redis.get(key)
        except Exception as exc:  # noqa: BLE001
            logger.debug("validation.context.cache_get_failed", err=str(exc))
            return None
        if raw is None:
            return None
        try:
            data = json.loads(raw)
            return [float(x) for x in data]
        except (ValueError, TypeError):
            return None

    async def _cache_set(self, key: str, value: list[float]) -> None:
        if self.redis is None:
            return
        try:
            await self.redis.set(key, json.dumps(value), ex=_CACHE_TTL_SECONDS)
        except Exception as exc:  # noqa: BLE001
            logger.debug("validation.context.cache_set_failed", err=str(exc))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_numeric_series(payload: Any) -> list[float]:
    """Pull numeric values from one of the shapes the backend returns:

      * ``{"events": [{"value_num": ...}, ...]}``
      * ``[{"valueNum": ...}, ...]``
      * ``[1.0, 2.0, 3.0]``
    """
    items: list[Any]
    if isinstance(payload, dict):
        items = payload.get("events") or payload.get("data") or []
    elif isinstance(payload, list):
        items = payload
    else:
        return []
    out: list[float] = []
    for it in items:
        if isinstance(it, (int, float)):
            out.append(float(it))
            continue
        if not isinstance(it, dict):
            continue
        for k in ("value_num", "valueNum", "value", "valueCanonical"):
            v = it.get(k)
            if isinstance(v, (int, float)):
                out.append(float(v))
                break
    return out
