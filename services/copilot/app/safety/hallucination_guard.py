"""
Hallucination guard.

For every numeric claim in the response that is associated with a `<cite metric="...">`
tag, we re-fetch the backing metric value from the warehouse and compare. If the
delta exceeds a tolerance threshold, we surface a disagreement so the UI can
mark the answer as unreliable (and the chat session can be retried with
stricter grounding).

This is intentionally NOT a token-level filter — by the time we run, the model
has already streamed its answer to the user. The point is to catch fabrications
*after* the fact and flag them clearly.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.tools import backend_client
from app.tools.registry import ToolContext


log = structlog.get_logger("copilot.safety.hallucination_guard")

# Match: "12,345 tCO2e <cite metric="scope1_total_tco2e" period="FY24-25"/>"
# We allow either the metric token immediately before or after the number.
_CLAIM_RE = re.compile(
    r"(?P<num>\d{1,3}(?:[,\s]?\d{3})*(?:\.\d+)?)\s*"
    r"(?P<unit>%|pct|tco2e|kwh|mwh|kl|kg|tonnes|gj)?\s*"
    r"<cite\s+metric=\"(?P<metric>[a-z0-9_]+)\""
    r"(?:[^/>]*?period=\"(?P<period>[A-Z0-9\-]+)\")?",
    re.IGNORECASE,
)

# Default 1% tolerance; tighter for safety-critical metrics.
_DEFAULT_TOLERANCE = 0.01
_STRICT_METRICS = {
    "fatality_count_employees",
    "fatality_count_contractors",
    "child_labour_incidents",
    "forced_labour_incidents",
}


@dataclass(slots=True)
class Disagreement:
    metric: str
    period: str | None
    claimed_value: float
    actual_value: float | None
    delta_pct: float | None
    severity: str  # "info" | "warn" | "critical"
    note: str


class HallucinationGuard:
    async def check(
        self,
        text: str,
        tool_use_log: list[dict[str, Any]],
        ctx: ToolContext,
    ) -> list[dict[str, Any]]:
        disagreements: list[Disagreement] = []
        seen: set[tuple[str, str]] = set()
        for m in _CLAIM_RE.finditer(text):
            metric = m.group("metric").lower()
            period = m.group("period") or ctx.fiscal_year or ""
            key = (metric, period)
            if key in seen:
                continue
            seen.add(key)
            claimed = _parse_number(m.group("num"))
            actual = await self._fetch_actual(ctx, metric, period)
            if claimed is None:
                continue
            if actual is None:
                disagreements.append(
                    Disagreement(
                        metric=metric,
                        period=period or None,
                        claimed_value=claimed,
                        actual_value=None,
                        delta_pct=None,
                        severity="critical" if metric in _STRICT_METRICS else "warn",
                        note="No backend value found to verify against.",
                    )
                )
                continue

            delta = abs(claimed - actual)
            denom = max(abs(actual), 1e-9)
            delta_pct = delta / denom
            tolerance = 0.0 if metric in _STRICT_METRICS else _DEFAULT_TOLERANCE
            if delta_pct > tolerance:
                disagreements.append(
                    Disagreement(
                        metric=metric,
                        period=period or None,
                        claimed_value=claimed,
                        actual_value=actual,
                        delta_pct=round(delta_pct * 100, 3),
                        severity="critical" if metric in _STRICT_METRICS else "warn",
                        note=(
                            f"Claimed {claimed:g} but warehouse holds {actual:g} "
                            f"(Δ {delta_pct * 100:.2f}%)."
                        ),
                    )
                )
        return [d.__dict__ for d in disagreements]

    async def _fetch_actual(
        self, ctx: ToolContext, metric: str, period: str
    ) -> float | None:
        if not period:
            return None
        try:
            data = await backend_client.get_metric_series(
                tenant_id=ctx.principal.tenant_id,
                user_id=ctx.principal.user_id,
                canonical_key=metric,
                period=period,
            )
        except Exception:
            log.exception("hallucination_guard.fetch_failed", metric=metric, period=period)
            return None
        if not data or not data.get("found", True):
            return None
        val = data.get("value")
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None


def _parse_number(s: str) -> float | None:
    try:
        return float(s.replace(",", "").replace(" ", ""))
    except ValueError:
        return None
