"""Layer 6 — Validation.

Wraps the declarative ``RuleEngine`` (sibling module) so the pipeline
can run business + domain checks on the normalised field list. Steps:

  1. Convert each ``NormalizedField`` -> ``ExtractedField`` (rules engine
     contract).
  2. Build a ``ValidationContext`` via ``ValidationContextLoader``.
  3. Evaluate every applicable rule.
  4. Attach validation issues and adjust confidence per validation outcome
     (the ``confidence_components.validation_score`` is set on each field
     and the composite re-derived in the orchestrator via the composite
     scorer).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.models.responses import ConfidenceComponents, ExtractedField, ValidationIssue
from app.pipeline.layer5_mapping import NormalizedField
from app.utils.logging import get_logger
from app.validation.context import ValidationContextLoader
from app.validation.rules_engine import DEFAULT_RULES, RuleEngine, Severity

logger = get_logger("pipeline.layer6")


@dataclass
class Layer6Output:
    fields: list[ExtractedField]
    issues: list[ValidationIssue] = field(default_factory=list)
    latency_ms: int = 0


class Layer6Validation:
    def __init__(self, engine: Optional[RuleEngine] = None) -> None:
        self.engine = engine or RuleEngine(DEFAULT_RULES)
        self.loader = ValidationContextLoader()

    async def validate(
        self,
        normalized: list[NormalizedField],
        *,
        tenant_id: Optional[str] = None,
        doc_type: Optional[str] = None,
        industry_hint: Optional[str] = None,
    ) -> Layer6Output:
        extracted = [_to_extracted(n) for n in normalized]

        ctx = await self.loader.load(
            tenant_id=tenant_id or "",
            fields=extracted,
            doc_type=doc_type,
            industry_hint=industry_hint,
        )
        result = self.engine.evaluate_all(extracted, ctx)

        # Re-derive validation_score from outcomes.
        for f, base in zip(result.revised_fields, extracted, strict=True):
            score = self._validation_score(f)
            f.confidence_components.validation_score = score
            # Promote needs_review on ERROR-severity issues.
            if any(i.severity == Severity.ERROR.value for i in f.validation_issues):
                f.needs_review = True

        return Layer6Output(
            fields=result.revised_fields,
            issues=result.issues,
            latency_ms=result.latency_ms,
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _validation_score(f: ExtractedField) -> float:
        if not f.validation_issues:
            return 1.0
        n_err = sum(1 for i in f.validation_issues if i.severity == Severity.ERROR.value)
        n_warn = sum(1 for i in f.validation_issues if i.severity == Severity.WARN.value)
        # Start at 1.0, subtract 0.5 per error, 0.1 per warning, floor 0.
        score = 1.0 - 0.5 * n_err - 0.1 * n_warn
        return max(0.0, min(1.0, score))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_extracted(n: NormalizedField) -> ExtractedField:
    """Project a NormalizedField onto the ExtractedField response model."""
    return ExtractedField(
        canonical_key=n.canonical_key,
        value_num=n.value,
        value_canonical=n.value_canonical,
        unit_extracted=n.unit_extracted,
        unit_canonical=n.unit_canonical,
        period_start=n.period_start,
        period_end=n.period_end,
        source_page=n.source_page,
        raw_text=n.raw_text or "",
        confidence_components=ConfidenceComponents(),
        confidence_composite=0.0,
        needs_review=False,
    )
