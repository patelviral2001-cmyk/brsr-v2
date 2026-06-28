"""Confidence scorer edge cases."""
from __future__ import annotations

import pytest

from app.confidence.scorer import ConfidenceScorer
from app.models.responses import ConfidenceComponents, ConfidenceLevel, ExtractedField


def _field(**kw) -> ExtractedField:
    base = dict(
        canonical_key="electricity_kwh",
        value_num=12345.0,
        value_canonical=12345.0,
        unit_extracted="kWh",
        unit_canonical="kWh",
        confidence_components=ConfidenceComponents(),
    )
    base.update(kw)
    return ExtractedField(**base)


def test_high_confidence_path():
    s = ConfidenceScorer()
    f = _field()
    scored = s.score_field(f, prior_values=[12000, 12500, 13000])
    assert scored.confidence_composite > 0.85
    assert scored.confidence_level == ConfidenceLevel.HIGH
    assert scored.needs_review is False


def test_low_confidence_when_constraint_violated():
    s = ConfidenceScorer()
    # Value way above max for electricity_kwh (max=1e12 in registry — pick something safe)
    f = _field(value_num=-100, value_canonical=-100)
    scored = s.score_field(f)
    # cross_validation == 0 → composite ≤ ~0.2
    assert scored.confidence_composite < 0.65
    assert scored.confidence_level == ConfidenceLevel.LOW
    assert scored.needs_review is True


def test_unknown_unit_drops_schema_score():
    s = ConfidenceScorer()
    f = _field(unit_extracted="bogus", unit_canonical=None)
    scored = s.score_field(f)
    assert scored.confidence_components.schema_validation < 0.55
    assert scored.needs_review is True


def test_outlier_zscore_flags():
    s = ConfidenceScorer()
    f = _field(value_canonical=1_000_000_000)
    scored = s.score_field(f, prior_values=[10000, 10500, 11000])
    assert scored.confidence_components.peer_zscore < 0.4
    assert scored.needs_review is True


def test_cross_source_agreement_high():
    s = ConfidenceScorer()
    f = _field(value_canonical=12345.0)
    scored = s.score_field(f, sibling_values=[12340.0, 12350.0])
    assert scored.confidence_components.cross_source > 0.8


def test_cross_source_disagreement_low():
    s = ConfidenceScorer()
    f = _field(value_canonical=12345.0)
    scored = s.score_field(f, sibling_values=[100.0, 200.0])
    assert scored.confidence_components.cross_source < 0.55
    assert scored.needs_review is True


def test_score_many_groups_siblings_by_key():
    s = ConfidenceScorer()
    fields = [
        _field(value_canonical=100.0),
        _field(value_canonical=101.0),
    ]
    out = s.score_many(fields)
    assert len(out) == 2
    for f in out:
        assert f.confidence_components.cross_source > 0.8
