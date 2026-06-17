"""
HallucinationGuard tests.

The guard re-fetches the cited metric value from the backend and flags any
disagreement that exceeds the tolerance. We stub backend_client.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.safety.hallucination_guard import HallucinationGuard
from app.tools.registry import ToolContext


class _StubPrincipal:
    tenant_id = "t_test"
    user_id = "u_test"


def _ctx() -> ToolContext:
    return ToolContext(
        principal=_StubPrincipal(),  # type: ignore[arg-type]
        fiscal_year="FY24-25",
        framework=None,
        section_id=None,
    )


@pytest.mark.asyncio
async def test_flags_value_mismatch(monkeypatch):
    async def fake_get_metric(**kwargs: Any):
        return {"value": 1000.0, "found": True}

    monkeypatch.setattr(
        "app.safety.hallucination_guard.backend_client.get_metric_series",
        fake_get_metric,
    )

    text = 'Scope 1 was 2000 tCO2e <cite metric="scope1_total_tco2e" period="FY24-25"/>.'
    out = await HallucinationGuard().check(text, [], _ctx())
    assert len(out) == 1
    d = out[0]
    assert d["metric"] == "scope1_total_tco2e"
    assert d["actual_value"] == 1000.0
    assert d["claimed_value"] == 2000.0
    assert d["severity"] in {"warn", "critical"}


@pytest.mark.asyncio
async def test_no_disagreement_when_value_matches(monkeypatch):
    async def fake_get_metric(**kwargs: Any):
        return {"value": 1234.0, "found": True}

    monkeypatch.setattr(
        "app.safety.hallucination_guard.backend_client.get_metric_series",
        fake_get_metric,
    )

    # Within default 1% tolerance.
    text = '1234 tCO2e <cite metric="scope1_total_tco2e" period="FY24-25"/>.'
    out = await HallucinationGuard().check(text, [], _ctx())
    assert out == []


@pytest.mark.asyncio
async def test_strict_metric_zero_tolerance(monkeypatch):
    async def fake_get_metric(**kwargs: Any):
        return {"value": 0, "found": True}

    monkeypatch.setattr(
        "app.safety.hallucination_guard.backend_client.get_metric_series",
        fake_get_metric,
    )

    # Fatalities are zero-tolerance; even claiming "1" when actual is 0 must flag critical.
    text = '1 <cite metric="fatality_count_employees" period="FY24-25"/>.'
    out = await HallucinationGuard().check(text, [], _ctx())
    assert len(out) == 1
    assert out[0]["severity"] == "critical"


@pytest.mark.asyncio
async def test_missing_backend_value_flags_unverifiable(monkeypatch):
    async def fake_get_metric(**kwargs: Any):
        return {"found": False}

    monkeypatch.setattr(
        "app.safety.hallucination_guard.backend_client.get_metric_series",
        fake_get_metric,
    )

    text = '500 tCO2e <cite metric="scope1_total_tco2e" period="FY24-25"/>.'
    out = await HallucinationGuard().check(text, [], _ctx())
    assert len(out) == 1
    assert out[0]["actual_value"] is None
    assert "No backend value" in out[0]["note"]
