"""Multi-component confidence scoring.

Five components (each ∈ [0,1]):
  * model_logprob       — LLM-reported confidence (0.85 default for non-LP models)
  * cross_validation    — value passed schema constraints? (binary)
  * peer_zscore         — |z-score vs prior periods| → 0..1 via Gaussian decay
  * schema_validation   — unit canonical-resolvable? (binary)
  * cross_source        — same metric/period extracted multiple times — agree?

Composite: geometric mean — punishes the weakest signal.

Levels:
  * HIGH    composite ≥ 0.85
  * MEDIUM  composite ≥ 0.65
  * LOW     composite  < 0.65

When level < HIGH or any individual component < 0.55, mark needs_review=True.
"""
from __future__ import annotations

import math
from typing import Iterable, Optional

from app.config import get_settings
from app.models.responses import (
    ConfidenceComponents,
    ConfidenceLevel,
    ExtractedField,
)
from app.registry import get_metric
from app.utils.units import canonical_unit


class ConfidenceScorer:
    def __init__(self) -> None:
        self.s = get_settings()

    # ------------------------------------------------------------------
    # Main API
    # ------------------------------------------------------------------
    def score_field(
        self,
        field: ExtractedField,
        *,
        prior_values: Optional[Iterable[float]] = None,
        sibling_values: Optional[Iterable[float]] = None,
    ) -> ExtractedField:
        comp = field.confidence_components

        # 1) model_logprob — keep what the agent set, otherwise default
        if not (0.0 <= comp.model_logprob <= 1.0):
            comp.model_logprob = 0.85

        # 2) cross_validation against value constraints
        metric = get_metric(field.canonical_key)
        if metric is not None and field.value_num is not None:
            c = metric.get("value_constraints") or {}
            ok = True
            if "min" in c and field.value_num < c["min"]:
                ok = False
            if "max" in c and field.value_num > c["max"]:
                ok = False
            comp.cross_validation = 1.0 if ok else 0.0
        elif field.value_num is None:
            comp.cross_validation = 0.0

        # 3) schema_validation — unit resolves to canonical?
        comp.schema_validation = 1.0 if canonical_unit(field.unit_extracted or field.unit_canonical) else 0.4

        # 4) peer_zscore vs prior_values
        if prior_values:
            z = _zscore(field.value_canonical, list(prior_values))
            if z is not None:
                comp.peer_zscore = float(max(0.0, min(1.0, math.exp(-(z**2) / 4.5))))

        # 5) cross_source agreement
        if sibling_values:
            comp.cross_source = float(self._agreement_score(field.value_canonical, list(sibling_values)))

        # Composite + level
        field.confidence_components = comp
        field.confidence_composite = self._composite(comp)
        field.confidence_level = self.level_from(field.confidence_composite)

        # Promote needs_review
        if (
            field.confidence_composite < self.s.CONFIDENCE_REVIEW_THRESHOLD
            or comp.cross_validation < 0.55
            or comp.schema_validation < 0.55
            or comp.peer_zscore < 0.4
            or comp.cross_source < 0.55
        ):
            field.needs_review = True

        return field

    def score_many(
        self,
        fields: list[ExtractedField],
        *,
        priors_by_key: Optional[dict[str, list[float]]] = None,
    ) -> list[ExtractedField]:
        # Group by canonical_key for sibling calculation
        siblings: dict[str, list[float]] = {}
        for f in fields:
            if f.value_canonical is not None:
                siblings.setdefault(f.canonical_key, []).append(f.value_canonical)
        out: list[ExtractedField] = []
        for f in fields:
            pv = (priors_by_key or {}).get(f.canonical_key, [])
            siblings_for_field = [v for v in siblings.get(f.canonical_key, []) if v != f.value_canonical]
            out.append(
                self.score_field(
                    f,
                    prior_values=pv,
                    sibling_values=siblings_for_field if siblings_for_field else None,
                )
            )
        return out

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _composite(c: ConfidenceComponents) -> float:
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

    def level_from(self, score: float) -> ConfidenceLevel:
        if score >= self.s.CONFIDENCE_HIGH_THRESHOLD:
            return ConfidenceLevel.HIGH
        if score >= self.s.CONFIDENCE_REVIEW_THRESHOLD:
            return ConfidenceLevel.MEDIUM
        return ConfidenceLevel.LOW

    @staticmethod
    def _agreement_score(value: Optional[float], siblings: list[float]) -> float:
        if value is None or not siblings:
            return 1.0
        diffs: list[float] = []
        for s in siblings:
            base = max(abs(value), abs(s), 1e-9)
            diffs.append(abs(value - s) / base)
        worst = max(diffs)
        # 0% diff → 1.0, 10% diff → 0.5, ≥30% diff → ~0
        return max(0.0, min(1.0, math.exp(-worst * 6.0)))


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
        return 0.0 if abs(value - mu) < 1e-9 else float("inf")
    return abs(value - mu) / sd
