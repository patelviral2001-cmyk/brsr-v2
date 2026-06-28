"""
CitationEnforcer tests.

Coverage:
  - cite tag extraction
  - verification against tool-use log
  - numeric claim without citation -> missing
  - sentence-level scoping
"""
from __future__ import annotations

from app.safety.citation_enforcer import CitationEnforcer


def test_extracts_metric_citation():
    text = 'Scope 1 was 1,234 tCO2e <cite metric="scope1_total_tco2e" period="FY24-25"/>.'
    log = [
        {
            "name": "get_metric",
            "input": {"canonical_key": "scope1_total_tco2e", "period": "FY24-25"},
            "result_preview": "{}",
        }
    ]
    result = CitationEnforcer().enforce(text, log)
    assert len(result.citations) == 1
    cite = result.citations[0]
    assert cite["kind"] == "metric"
    assert cite["key"] == "scope1_total_tco2e"
    assert cite["verified"] is True


def test_unverified_when_tool_not_called():
    text = 'Scope 1 was 1,234 tCO2e <cite metric="scope1_total_tco2e" period="FY24-25"/>.'
    result = CitationEnforcer().enforce(text, [])
    assert result.citations[0]["verified"] is False


def test_extracts_document_citation():
    text = 'Per the policy <cite doc="pol_abc" page="3"/>, the entity follows ISO 14001.'
    log = [
        {
            "name": "search_documents",
            "input": {"query": "policy"},
            "result_preview": '"document_id": "pol_abc"',
        }
    ]
    result = CitationEnforcer().enforce(text, log)
    assert result.citations[0]["kind"] == "doc"
    assert result.citations[0]["verified"] is True


def test_missing_citation_for_numeric():
    text = "Total water withdrawal was 45,678 KL during the period."
    result = CitationEnforcer().enforce(text, [])
    kinds = [c["kind"] for c in result.citations]
    assert "missing" in kinds


def test_sentence_scoping():
    # Cite in second sentence should not vouch for first sentence's number.
    text = (
        "Scope 1 was 100 tCO2e. "
        'Scope 2 was 200 tCO2e <cite metric="scope2_location_tco2e" period="FY24-25"/>.'
    )
    log = [
        {
            "name": "get_metric",
            "input": {"canonical_key": "scope2_location_tco2e", "period": "FY24-25"},
            "result_preview": "{}",
        }
    ]
    result = CitationEnforcer().enforce(text, log)
    # The first sentence should appear as a missing-citation finding.
    missing = [f for f in result.findings if f.type == "missing"]
    assert any("100 tCO2e" in (f.sentence or "") for f in missing) or any(
        "100" in (f.numeric_claim or "") for f in missing
    )


def test_ignores_bare_years():
    text = "We started reporting in 2018."
    result = CitationEnforcer().enforce(text, [])
    # No numeric claim, no citation expected.
    missing = [c for c in result.citations if c["kind"] == "missing"]
    assert missing == []
