"""
WriterAgent — drafts the narrative response for a disclosure section.

CRITICAL behaviours:
  * Never publishes directly — output is always marked DRAFT for human review.
  * Every paragraph must contain at least one citation token of the form
    <cite metric="canonical_key" period="FY24-25"/>  or
    <cite doc="document_id" page="N"/>
  * Pulls the relevant canonical metrics for the section via the backend first
    so the model writes against grounded numbers, not its training data.
"""
from __future__ import annotations

from app.agents.base import BaseAgent
from app.prompts.prompts import load_prompt


class WriterAgent(BaseAgent):
    name = "WriterAgent"
    use_citation_enforcer = True
    use_hallucination_guard = True

    def system_prompt(self) -> str:
        return load_prompt("writer_agent_system")

    def expose_tools(self) -> list[str]:
        return [
            "get_metric",
            "get_calc_run",
            "get_framework_completion",
            "search_documents",
        ]
