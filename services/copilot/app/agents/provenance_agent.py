"""
ProvenanceAgent — produces a human-readable explanation of a metric's lineage.

It calls the backend's assurance walkthrough endpoint, which returns the full
calculation graph (raw activity data -> formula -> factor -> conversion ->
canonical value) along with the linked source documents and approvals.

The agent's job is mostly formatting and explanation; numeric values come from
the backend response, not the LLM.
"""
from __future__ import annotations

from app.agents.base import BaseAgent
from app.prompts.prompts import load_prompt


class ProvenanceAgent(BaseAgent):
    name = "ProvenanceAgent"
    use_citation_enforcer = True
    use_hallucination_guard = True

    def system_prompt(self) -> str:
        return load_prompt("provenance_agent_system")

    def expose_tools(self) -> list[str]:
        return ["get_metric", "get_calc_run"]
