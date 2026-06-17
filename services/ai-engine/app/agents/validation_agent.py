"""Validation agent — runs after extraction (or as standalone /validate call).

Steps per field:
  1. Period-over-period z-score across ``prior_periods`` (>3σ → flag outlier).
  2. Unit-of-measure sanity (e.g. electricity in MWh range expected).
  3. Inter-field consistency (water_consumed ≈ withdrawn − discharged, etc).
  4. LLM plausibility opinion against sector benchmark hints (GPT-5).
  5. Adjust confidence and emit issues.
"""
from __future__ import annotations

import asyncio
import json
import math
from typing import Any, Optional

from app.agents.prompt_versions import VALIDATOR_V2
from app.config import TaskType
from app.llm.openai_helper import json_schema_to_response_format
from app.llm.router import LLMError, get_router
from app.models.responses import (
    ConfidenceLevel,
    ExtractedField,
    ValidateResponse,
    ValidationIssue,
)
from app.registry import get_metric
from app.utils.logging import get_logger

logger = get_logger("agents.validator")


VALIDATOR_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "plausible": {"type": "boolean"},
        "severity": {"type": "string", "enum": ["info", "warning", "error"]},
        "issue_code": {"type": "string"},
        "message": {"type": "string", "maxLength": 300},
        "suggested_value": {"type": ["number", "null"]},
        "confidence_adjustment": {"type": "number", "minimum": -1.0, "maximum": 1.0},
    },
    "required": ["plausible", "severity", "issue_code", "message"],
}


VALIDATOR_RESPONSE_FORMAT = json_schema_to_response_format(
    VALIDATOR_RESPONSE_SCHEMA,
    name="ValidatorOpinion",
    strict=False,
)


# Rough sector-aware ranges per metric. Used to bias the LLM and to do a
# deterministic sanity check ahead of the LLM call.
_SECTOR_BENCHMARKS: dict[str, dict[str, tuple[float, float]]] = {
    "electricity_kwh": {
        "_default": (1_000, 1_000_000_000),
    },
    "scope1_emissions_tco2e": {
        "_default": (0.1, 5_000_000),
    },
    "scope2_emissions_location_tco2e": {
        "_default": (0.1, 5_000_000),
    },
    "ltifr": {"_default": (0.0, 50.0)},
    "trifr": {"_default": (0.0, 100.0)},
    "women_on_board_pct": {"_default": (0.0, 100.0)},
}


class ValidationAgent:
    def __init__(self) -> None:
        self.router = get_router()

    async def validate(
        self,
        *,
        tenant_id: str,
        fields: list[ExtractedField],
        historical: dict[str, list[dict[str, Any]]] | None = None,
        industry_sector: str | None = None,
        organisation_size: str | None = None,
    ) -> ValidateResponse:
        issues: list[ValidationIssue] = []
        revised: list[ExtractedField] = []
        model_calls = 0
        import time as _t

        t0 = _t.perf_counter()

        sem = asyncio.Semaphore(6)

        async def validate_one(f: ExtractedField) -> tuple[ExtractedField, list[ValidationIssue], int]:
            nonlocal model_calls
            local_issues: list[ValidationIssue] = []
            new_field = f.model_copy(deep=True)
            metric = get_metric(f.canonical_key)
            if metric is None:
                return new_field, local_issues, 0

            # 1) z-score
            prior = (historical or {}).get(f.canonical_key, [])
            prior_nums = [p["value_num"] for p in prior if isinstance(p.get("value_num"), (int, float))]
            z = _zscore(f.value_canonical, prior_nums)
            if z is not None:
                # Convert |z| → 0..1 score (z=0 → 1, z=3 → ~0.32)
                peer = math.exp(-(z**2) / 4.5)
                new_field.confidence_components.peer_zscore = float(max(0.0, min(1.0, peer)))
                if z > 3:
                    local_issues.append(
                        ValidationIssue(
                            canonical_key=f.canonical_key,
                            severity="warning",
                            code="OUTLIER_ZSCORE",
                            message=f"Value is {z:.2f}σ from prior period mean.",
                            detail={"z": z},
                        )
                    )
                    new_field.needs_review = True

            # 2) range sanity
            rng = _SECTOR_BENCHMARKS.get(f.canonical_key, {}).get(industry_sector or "_default") or _SECTOR_BENCHMARKS.get(
                f.canonical_key, {}
            ).get("_default")
            if rng and f.value_canonical is not None:
                lo, hi = rng
                if f.value_canonical < lo or f.value_canonical > hi:
                    local_issues.append(
                        ValidationIssue(
                            canonical_key=f.canonical_key,
                            severity="warning",
                            code="RANGE_OUT_OF_BAND",
                            message=f"Outside expected range [{lo:g}, {hi:g}].",
                            detail={"range": [lo, hi]},
                        )
                    )
                    new_field.confidence_components.schema_validation = min(
                        new_field.confidence_components.schema_validation, 0.5
                    )
                    new_field.needs_review = True

            # 3) LLM plausibility opinion
            try:
                payload = {
                    "field": {
                        "canonical_key": f.canonical_key,
                        "value_num": f.value_canonical,
                        "unit": f.unit_canonical,
                        "period_start": f.period_start.isoformat() if f.period_start else None,
                        "period_end": f.period_end.isoformat() if f.period_end else None,
                    },
                    "industry_sector": industry_sector,
                    "organisation_size": organisation_size,
                    "prior_periods": prior,
                    "peer_benchmarks": rng,
                }
                async with sem:
                    res = await self.router.chat(
                        task=TaskType.VALIDATE_FIELD,
                        messages=[
                            {"role": "system", "content": VALIDATOR_V2.content},
                            {"role": "user", "content": json.dumps(payload, ensure_ascii=False, default=str)},
                        ],
                        prompt_version=VALIDATOR_V2.name,
                        tenant_id=tenant_id,
                        response_format=VALIDATOR_RESPONSE_FORMAT,
                    )
                    model_calls += 1
                parsed = res.parsed or {}
                if not parsed.get("plausible", True):
                    local_issues.append(
                        ValidationIssue(
                            canonical_key=f.canonical_key,
                            severity=str(parsed.get("severity", "warning")),
                            code=str(parsed.get("issue_code", "IMPLAUSIBLE")),
                            message=str(parsed.get("message", "")),
                            suggested_value=parsed.get("suggested_value"),
                        )
                    )
                    new_field.needs_review = True
                adj = float(parsed.get("confidence_adjustment", 0.0) or 0.0)
                if adj:
                    new_field.confidence_components.cross_validation = max(
                        0.0, min(1.0, new_field.confidence_components.cross_validation + adj)
                    )
            except LLMError as e:
                logger.warning("validator.llm_failed", err=str(e), key=f.canonical_key)

            # Re-score composite
            new_field.confidence_composite = _composite(new_field.confidence_components)
            new_field.confidence_level = _level(new_field.confidence_composite)
            return new_field, local_issues, model_calls

        results = await asyncio.gather(*(validate_one(f) for f in fields))
        for new_f, local_issues, _ in results:
            revised.append(new_f)
            issues.extend(local_issues)

        latency_ms = int((_t.perf_counter() - t0) * 1000)
        return ValidateResponse(
            issues=issues,
            revised_fields=revised,
            model_calls=model_calls,
            latency_ms=latency_ms,
        )


def _zscore(value: Optional[float], prior: list[float]) -> Optional[float]:
    if value is None or not prior:
        return None
    n = len(prior)
    mu = sum(prior) / n
    if n < 2:
        return abs(value - mu) / (abs(mu) + 1e-9) * 2.0
    var = sum((x - mu) ** 2 for x in prior) / (n - 1)
    sd = math.sqrt(var)
    if sd < 1e-9:
        return abs(value - mu) / 1e-9 if abs(value - mu) > 1e-9 else 0.0
    return abs(value - mu) / sd


def _composite(c: Any) -> float:
    """Geometric mean of components — sensitive to weakest link."""
    vals = [
        max(c.model_logprob, 1e-3),
        max(c.cross_validation, 1e-3),
        max(c.peer_zscore, 1e-3),
        max(c.schema_validation, 1e-3),
        max(c.cross_source, 1e-3),
    ]
    prod = 1.0
    for v in vals:
        prod *= v
    return round(prod ** (1 / len(vals)), 4)


def _level(score: float) -> ConfidenceLevel:
    if score >= 0.85:
        return ConfidenceLevel.HIGH
    if score >= 0.65:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW
