"""
WriterAgent tests.
"""
from __future__ import annotations

from app.agents.writer_agent import WriterAgent


def test_writer_system_prompt_loads():
    agent = WriterAgent()
    prompt = agent.system_prompt()
    assert "DRAFT" in prompt
    assert "publish" in prompt.lower()
    assert "<cite" in prompt


def test_writer_exposes_metric_tool():
    agent = WriterAgent()
    tools = agent.expose_tools()
    assert "get_metric" in tools
    assert "search_documents" in tools
    assert "get_framework_completion" in tools


def test_writer_enables_safety():
    agent = WriterAgent()
    assert agent.use_citation_enforcer is True
    assert agent.use_hallucination_guard is True
