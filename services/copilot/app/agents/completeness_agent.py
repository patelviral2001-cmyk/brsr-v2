"""
CompletenessAgent — answers "what's missing for BRSR Core?" (and other frameworks).

Strategy: call get_framework_completion against the backend, post-process the
gap list to be tenant-readable, and (optionally) suggest the next-best actions.
"""
from __future__ import annotations

from app.agents.base import BaseAgent
from app.prompts.prompts import load_prompt


class CompletenessAgent(BaseAgent):
    name = "CompletenessAgent"
    use_citation_enforcer = True  # gap counts should map to data sources
    use_hallucination_guard = False

    def system_prompt(self) -> str:
        return load_prompt("completeness_agent_system")

    def expose_tools(self) -> list[str]:
        return ["get_framework_completion", "get_metric", "list_recent_changes"]
