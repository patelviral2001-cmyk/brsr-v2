"""Cost & rate guardrails for the AI engine.

Three layers:

  1. Per-tenant rate limit — sliding-window counter (Redis if available,
     in-memory fallback). Default: 100 extractions / minute.

  2. Per-document cost cap — callers `add_cost()` after every LLM call and
     `check_budget()` to early-abort. Default: $1.00 per document.

  3. Daily global circuit breaker — cumulative USD across the process /
     Redis cluster; when exceeded, every new extraction is rejected until
     the next UTC day. Controlled by ``OPENAI_MAX_DAILY_USD``.

The Redis paths use SETEX/INCRBYFLOAT so multi-replica deployments share
the counters; in-memory mode is best-effort and only safe for single-node.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from app.config import get_settings
from app.utils.logging import get_logger, hash_tenant

logger = get_logger("guardrails")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class GuardrailError(RuntimeError):
    """Base class for any guardrail rejection."""


class RateLimitExceeded(GuardrailError):
    """Tenant has exceeded its per-minute extraction quota."""


class CostBudgetExceeded(GuardrailError):
    """Per-document USD cap was hit."""


class DailyBudgetExceeded(GuardrailError):
    """Daily OPENAI_MAX_DAILY_USD circuit breaker has tripped."""


# ---------------------------------------------------------------------------
# In-memory state (fallback when Redis is unavailable)
# ---------------------------------------------------------------------------


_RATE_BUCKETS: dict[str, deque[float]] = {}
_DAILY_TOTAL: dict[str, float] = {}
_LOCK = asyncio.Lock()


def _today_key() -> str:
    return dt.datetime.utcnow().strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Per-document cost tracker
# ---------------------------------------------------------------------------


@dataclass
class DocBudget:
    """Per-document cost accumulator.

    Create one before each extraction; call ``add()`` after each LLM call.
    ``check()`` raises ``CostBudgetExceeded`` when the cap is breached.
    """

    document_id: str
    tenant_id: str
    cap_usd: float = 1.0
    spent_usd: float = 0.0
    calls: int = 0
    started_at: float = field(default_factory=time.time)

    def add(self, cost_usd: float) -> None:
        if cost_usd < 0:
            cost_usd = 0.0
        self.spent_usd += float(cost_usd)
        self.calls += 1

    def remaining(self) -> float:
        return max(0.0, self.cap_usd - self.spent_usd)

    def check(self) -> None:
        if self.spent_usd > self.cap_usd:
            raise CostBudgetExceeded(
                f"document={self.document_id} spent=${self.spent_usd:.4f} cap=${self.cap_usd:.2f}"
            )


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------


class RateLimiter:
    """Sliding-window per-tenant rate limiter.

    Uses Redis SETEX/INCR when a redis client is provided; otherwise an
    in-process deque per tenant (best-effort, single-node only).
    """

    def __init__(self, *, redis: Optional[object] = None, per_minute: int = 100) -> None:
        self.redis = redis
        self.per_minute = int(per_minute)

    async def check(self, tenant_id: str) -> None:
        now = time.time()
        bucket_key = self._bucket_key(tenant_id, now)

        # Redis path — use INCR + EXPIRE on a per-minute bucket key.
        if self.redis is not None:
            try:
                # type: ignore[attr-defined]  — duck-typed redis.asyncio.Redis
                count = await self.redis.incr(bucket_key)  # type: ignore[union-attr]
                if count == 1:
                    await self.redis.expire(bucket_key, 65)  # type: ignore[union-attr]
                if int(count) > self.per_minute:
                    raise RateLimitExceeded(
                        f"tenant={hash_tenant(tenant_id)} exceeded {self.per_minute}/min"
                    )
                return
            except RateLimitExceeded:
                raise
            except Exception as e:  # pragma: no cover
                logger.warning("ratelimit.redis_failed_falling_back", err=str(e))

        # In-memory fallback.
        async with _LOCK:
            q = _RATE_BUCKETS.setdefault(tenant_id, deque())
            cutoff = now - 60.0
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.per_minute:
                raise RateLimitExceeded(
                    f"tenant={hash_tenant(tenant_id)} exceeded {self.per_minute}/min"
                )
            q.append(now)

    @staticmethod
    def _bucket_key(tenant_id: str, now: float) -> str:
        minute = int(now // 60)
        return f"airl:{hash_tenant(tenant_id)}:{minute}"


# ---------------------------------------------------------------------------
# Daily circuit breaker
# ---------------------------------------------------------------------------


class DailyBudgetGuard:
    """Process-wide (or Redis-shared) daily USD ceiling.

    Call ``check()`` before every extraction and ``add(cost)`` after every
    LLM call. Once cumulative cost for the UTC day exceeds the cap, new
    ``check()`` calls raise ``DailyBudgetExceeded`` until midnight UTC.
    """

    def __init__(self, *, redis: Optional[object] = None, cap_usd: Optional[float] = None) -> None:
        self.redis = redis
        s = get_settings()
        self.cap_usd = float(cap_usd if cap_usd is not None else getattr(s, "OPENAI_MAX_DAILY_USD", 0.0) or 0.0)

    def _redis_key(self) -> str:
        return f"ai:openai:daily_usd:{_today_key()}"

    async def add(self, cost_usd: float) -> None:
        if cost_usd <= 0:
            return
        if self.redis is not None:
            try:
                # type: ignore[union-attr]
                total = await self.redis.incrbyfloat(self._redis_key(), float(cost_usd))  # type: ignore[union-attr]
                await self.redis.expire(self._redis_key(), 60 * 60 * 30)  # ~30h, covers tz drift  # type: ignore[union-attr]
                _DAILY_TOTAL[_today_key()] = float(total)
                return
            except Exception as e:  # pragma: no cover
                logger.warning("daily_budget.redis_failed", err=str(e))
        async with _LOCK:
            _DAILY_TOTAL[_today_key()] = _DAILY_TOTAL.get(_today_key(), 0.0) + float(cost_usd)

    async def current_total(self) -> float:
        if self.redis is not None:
            try:
                # type: ignore[union-attr]
                v = await self.redis.get(self._redis_key())  # type: ignore[union-attr]
                return float(v) if v is not None else 0.0
            except Exception:  # pragma: no cover
                pass
        return _DAILY_TOTAL.get(_today_key(), 0.0)

    async def check(self) -> None:
        if self.cap_usd <= 0:
            return
        total = await self.current_total()
        if total >= self.cap_usd:
            raise DailyBudgetExceeded(
                f"daily OpenAI spend ${total:.2f} >= cap ${self.cap_usd:.2f}"
            )


# ---------------------------------------------------------------------------
# Convenience singletons (constructed on first use)
# ---------------------------------------------------------------------------


_rate_limiter: Optional[RateLimiter] = None
_daily_guard: Optional[DailyBudgetGuard] = None


def get_rate_limiter(redis: Optional[object] = None) -> RateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        s = get_settings()
        _rate_limiter = RateLimiter(
            redis=redis,
            per_minute=int(getattr(s, "RATE_LIMIT_PER_MINUTE", 100) or 100),
        )
    elif redis is not None and _rate_limiter.redis is None:
        _rate_limiter.redis = redis
    return _rate_limiter


def get_daily_guard(redis: Optional[object] = None) -> DailyBudgetGuard:
    global _daily_guard
    if _daily_guard is None:
        _daily_guard = DailyBudgetGuard(redis=redis)
    elif redis is not None and _daily_guard.redis is None:
        _daily_guard.redis = redis
    return _daily_guard
