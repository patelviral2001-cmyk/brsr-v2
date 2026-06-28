"""
AnalyticalAgent — explains *why* a number moved.

Strategy: text-to-SQL via Claude Sonnet against ClickHouse warehouse views (the
backend exposes a `/warehouse/query` endpoint that runs a whitelisted SQL set).
We model the agent as a tool-use loop with two power tools:

  * get_metric(...) — fetch a single canonical metric over a period
  * get_calc_run(...) — fetch a calculation lineage
  * search_documents(...) — pull narrative context from related docs
"""
from __future__ import annotations

from app.agents.base import BaseAgent
from app.prompts.prompts import load_prompt


class AnalyticalAgent(BaseAgent):
    name = "AnalyticalAgent"
    use_citation_enforcer = True
    use_hallucination_guard = True  # numerical answers must agree with warehouse

    def system_prompt(self) -> str:
        return load_prompt("analytical_agent_system")

    def expose_tools(self) -> list[str]:
        return [
            "get_metric",
            "get_calc_run",
            "search_documents",
            "list_recent_changes",
        ]
