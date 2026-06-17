"""
DefinitionAgent tests.

We assert it loads its system prompt and exposes the correct tools.
End-to-end tool-call loop is tested separately with stubbed Anthropic.
"""
from __future__ import annotations

from app.agents.definition_agent import DefinitionAgent


def test_system_prompt_loads():
    agent = DefinitionAgent()
    prompt = agent.system_prompt()
    assert "Definition Agent" in prompt
    assert "<cite" in prompt
    assert "search_documents" in prompt


def test_exposed_tools():
    agent = DefinitionAgent()
    tools = agent.expose_tools()
    # Definitions are RAG-only — they must not touch warehouse metrics.
    assert "search_documents" in tools
    assert "get_metric" not in tools
    assert "get_calc_run" not in tools
