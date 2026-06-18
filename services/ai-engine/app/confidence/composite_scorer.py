"""Composite confidence scorer — 6 components.

Each field's composite confidence is the geometric mean of six independent
signals, each in ``[0, 1]``:

  1. ``ocr_quality``           – quality of the underlying text (1.0 for
                                 native PDF, lower for OCR / scanned).
  2. ``header_match``          – how well the source column / label maps
                                 to the canonical metric: exact alias =
                                 1.0, fuzzy = 0.7, semantic = 0.5.
  3. ``unit_match``            – 1.0 if the unit canonicalises and is
                                 compatible with the metric's canonical
                                 unit; 0.5 otherwise.
  4. ``cross_validation``      – agreement with other fields in the same
                                 document (e.g. multiple extractions of
                                 the same key).
  5. ``document_type_match``   – does this metric's category match the
                                 detected document type? 1.0 = yes, 0.6
                                 unknown, 0.3 mismatch.
  6. ``historical_consistency`` – z-score-based score against prior
                                 values (close to historical → 1.0).

Discrete level mapping: HIGH ≥0.85, MEDIUM ≥0.65, LOW <0.65.

The composite ignores any NaN/inf component and replaces it with 0.5 so
the geometric mean stays meaningful when a signal is missing.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Optional

from app.models.responses import (
    ConfidenceComponents,
    ConfidenceLevel,
    ExtractedField,
)
from app.pipeline.layer1_classifier import Layer1Result
from app.pipeline.layer2_layout import LayoutPage
from app.registry import get_metric
from app.utils.units import canonical_unit, is_compatible


@dataclass
class CompositeConfidenceComponents:
    ocr_quality: float = 1.0
    header_match: float = 0.8
    unit_match: float = 0.8
    cross_validation: float = 1.0
    document_type_match: float = 0.8
    historical_consistency: float = 1.0

    def values(self) -> list[float]:
        return [
            self.ocr_quality,
            self.header_match,
            self.unit_match,
            self.cross_validation,
            self.document_type_match,
            self.historical_consistency,
        ]


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

HIGH_THRESHOLD = 0.85
MEDIUM_THRESHOLD = 0.65
COMPONENT_FLOOR = 1e-3
NEUTRAL = 0.5


def _sanitize(v: float) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return NEUTRAL
    if math.isnan(x) or math.isinf(x):
        return NEUTRAL
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


def geometric_mean(values: Iterable[float]) -> float:
    vs = [max(_sanitize(v), COMPONENT_FLOOR) for v in values]
    if not vs:
        return COMPONENT_FLOOR
    prod = 1.0
    for v in vs:
        prod *= v
    if prod <= 0 or math.isnan(prod) or math.isinf(prod):
        return COMPONENT_FLOOR
    return prod ** (1.0 / len(vs))


def level_for(score: float) -> ConfidenceLevel:
    if math.isnan(score):
        return ConfidenceLevel.LOW
    if score >= HIGH_THRESHOLD:
        return ConfidenceLevel.HIGH
    if score >= MEDIUM_THRESHOLD:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------


_DOC_TYPE_TO_CATEGORIES: dict[str, set[str]] = {
    "UTILITY_BILL": {"energy", "ghg"},
    "FUEL_INVOICE": {"energy", "ghg"},
    "WATER_BILL": {"water"},
    "WASTE_MANIFEST": {"waste"},
    "HR_PAYROLL": {"workforce", "training"},
    "HR_HEADCOUNT_SHEET": {"workforce", "training"},
    "EHS_INCIDENT_REPORT": {"health_safety", "workforce"},
    "AUDITED_FINANCIALS": {"financial", "governance"},
    "BOARD_MINUTES": {"governance"},
    "CSR_SPEND_REPORT": {"community", "financial"},
    "ENERGY_AUDIT": {"energy", "ghg"},
}


class CompositeConfidenceScorer:
    """Score a field using all six components."""

    def score(
        self,
        field: ExtractedField,
        *,
        layer1: Optional[Layer1Result] = None,
        layer2_pages: Optional[list[LayoutPage]] = None,
        header_match_hint: Optional[float] = None,
        siblings: Optional[list[float]] = None,
        prior_values: Optional[list[float]] = None,
    ) -> ExtractedField:
        comps = CompositeConfidenceComponents()
        comps.ocr_quality = self._ocr_quality(layer2_pages)
        comps.header_match = (
            header_match_hint if header_match_hint is not None else self._header_match_for(field)
        )
        comps.unit_match = self._unit_match(field)
        comps.cross_validation = self._cross_validation(field, siblings)
        comps.document_type_match = self._doc_type_match(field, layer1)
        comps.historical_consistency = self._historical(field, prior_values)

        composite = geometric_mean(comps.values())
        composite = round(composite, 4)
        field.confidence_composite = composite
        field.confidence_level = level_for(composite)

        # Bridge to the legacy 5-component ConfidenceComponents used by
        # downstream consumers — map components to the closest equivalents.
        cc = field.confidence_components or ConfidenceComponents()
        cc.model_logprob = comps.header_match
        cc.cross_validation = comps.cross_validation
        cc.peer_zscore = comps.historical_consistency
        cc.schema_validation = comps.unit_match
        cc.cross_source = comps.document_type_match
        # Preserve validation_score if set by Layer 6.
        if cc.validation_score is None:
            cc.validation_score = 1.0
        field.confidence_components = cc

        # Promote needs_review when MEDIUM+below or any component < 0.55
        if composite < MEDIUM_THRESHOLD or any(v < 0.55 for v in comps.values()):
            field.needs_review = True

        return field

    # ------------------------------------------------------------------
    # Components
    # ------------------------------------------------------------------
    @staticmethod
    def _ocr_quality(layer2_pages: Optional[list[LayoutPage]]) -> float:
        if not layer2_pages:
            return 1.0
        scores: list[float] = []
        for p in layer2_pages:
            if p.is_native:
                scores.append(1.0)
            else:
                # OCR — estimate from block count vs total tokens.
                if not p.blocks:
                    scores.append(0.4)
                    continue
                avg_len = sum(len(b.text.split()) for b in p.blocks) / max(1, len(p.blocks))
                scores.append(min(1.0, 0.55 + 0.05 * avg_len))
        return sum(scores) / len(scores)

    @staticmethod
    def _header_match_for(field: ExtractedField) -> float:
        meta = get_metric(field.canonical_key)
        if not meta:
            return 0.5
        # If the raw_text contains the canonical name verbatim, that's exact.
        rt = (field.raw_text or "").lower()
        if not rt:
            return 0.75
        name = (meta.get("name") or "").lower()
        if name and name in rt:
            return 1.0
        for alias in meta.get("aliases", []):
            if alias.lower() in rt:
                return 0.85
        return 0.6

    @staticmethod
    def _unit_match(field: ExtractedField) -> float:
        meta = get_metric(field.canonical_key)
        target = meta.get("unit") if meta else None
        if not target:
            return 0.7
        u = canonical_unit(field.unit_extracted or field.unit_canonical or "")
        if not u:
            return 0.5
        if u == canonical_unit(target):
            return 1.0
        if is_compatible(u, target):
            return 0.9
        return 0.4

    @staticmethod
    def _cross_validation(field: ExtractedField, siblings: Optional[list[float]]) -> float:
        v = field.value_canonical
        if v is None or not siblings:
            return 1.0
        diffs = []
        for s in siblings:
            base = max(abs(v), abs(s), 1e-9)
            diffs.append(abs(v - s) / base)
        worst = max(diffs) if diffs else 0.0
        return max(0.0, min(1.0, math.exp(-worst * 6.0)))

    @staticmethod
    def _doc_type_match(field: ExtractedField, layer1: Optional[Layer1Result]) -> float:
        if layer1 is None:
            return 0.7
        cats = _DOC_TYPE_TO_CATEGORIES.get(layer1.doc_type)
        if not cats:
            return 0.7
        meta = get_metric(field.canonical_key)
        if not meta:
            return 0.5
        return 1.0 if meta.get("category") in cats else 0.5

    @staticmethod
    def _historical(field: ExtractedField, priors: Optional[list[float]]) -> float:
        v = field.value_canonical
        if v is None or not priors:
            return 1.0
        n = len(priors)
        mu = sum(priors) / n
        if n < 2:
            return max(0.0, min(1.0, math.exp(-abs(v - mu) / (abs(mu) + 1e-9))))
        var = sum((x - mu) ** 2 for x in priors) / (n - 1)
        sd = math.sqrt(var)
        if sd < 1e-9:
            return 1.0 if abs(v - mu) < 1e-6 else 0.4
        z = abs(v - mu) / sd
        return max(0.0, min(1.0, math.exp(-(z**2) / 4.5)))

    def score_many(
        self,
        fields: list[ExtractedField],
        *,
        layer1: Optional[Layer1Result] = None,
        layer2_pages: Optional[list[LayoutPage]] = None,
        priors_by_key: Optional[dict[str, list[float]]] = None,
    ) -> list[ExtractedField]:
        siblings_by_key: dict[str, list[float]] = {}
        for f in fields:
            if f.value_canonical is not None:
                siblings_by_key.setdefault(f.canonical_key, []).append(f.value_canonical)
        out: list[ExtractedField] = []
        for f in fields:
            pv = (priors_by_key or {}).get(f.canonical_key)
            sib = [v for v in siblings_by_key.get(f.canonical_key, []) if v != f.value_canonical]
            out.append(
                self.score(
                    f,
                    layer1=layer1,
                    layer2_pages=layer2_pages,
                    siblings=sib if sib else None,
                    prior_values=pv,
                )
            )
        return out
