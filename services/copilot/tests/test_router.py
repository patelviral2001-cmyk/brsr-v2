"""
IntentRouter tests.

We unit-test the heuristic shortcut path (no LLM call required) and stub the
LLM call for cases that fall through.
"""
from __future__ import annotations

import pytest

from app.agents.router import IntentRouter


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "query,expected",
    [
        ("What is Scope 3 category 1?", "DEFINITION"),
        ("Define BRSR Core", "DEFINITION"),
        ("Explain the term materiality", "DEFINITION"),
        ("Why is energy up 18%?", "ANALYTICAL"),
        ("Why did Scope 1 jump this quarter?", "ANALYTICAL"),
        ("What changed in our water withdrawal?", "ANALYTICAL"),
        ("Generate Principle 6 narrative for FY24-25", "WRITER"),
        ("Generate a paragraph for E1-5", "WRITER"),
        ("What's missing for BRSR Core?", "COMPLETENESS"),
        ("Show me completeness for GRI", "COMPLETENESS"),
        ("How do we compare to peers in IT services?", "BENCHMARKING"),
        ("Benchmark our LTIFR against industry average", "BENCHMARKING"),
        ("How was electricity_kwh calculated for our Pune plant?", "PROVENANCE"),
        ("Show me how Scope 2 was computed", "PROVENANCE"),
    ],
)
async def test_classify_heuristic(query: str, expected: str):
    router = IntentRouter()
    intent = await router.classify(query)
    assert intent == expected


@pytest.mark.asyncio
async def test_classify_fallback_uses_llm(monkeypatch):
    """When heuristics don't match, the router falls through to the LLM."""

    router = IntentRouter()

    class _Stub:
        async def create(self, **kwargs):
            class Block:
                type = "text"
                text = "GENERAL"

            class Msg:
                content = [Block()]

            return Msg()

    monkeypatch.setattr(router.anthropic, "messages", _Stub())
    intent = await router.classify("Tell me about our company")
    assert intent == "GENERAL"


@pytest.mark.asyncio
async def test_classify_unknown_response_defaults_to_general(monkeypatch):
    router = IntentRouter()

    class _Stub:
        async def create(self, **kwargs):
            class Block:
                type = "text"
                text = "nonsense_response"

            class Msg:
                content = [Block()]

            return Msg()

    monkeypatch.setattr(router.anthropic, "messages", _Stub())
    intent = await router.classify("ambiguous question xyz")
    assert intent == "GENERAL"
