"""
DefinitionAgent — answers conceptual questions about ESG frameworks.

Strategy: retrieve a handful of canonical framework reference chunks via RAG,
inject them into the system prompt as context, then let the model answer with
inline citation chips ("[doc:xyz#page:4]").
"""
from __future__ import annotations

from app.agents.base import BaseAgent
from app.prompts.prompts import load_prompt


class DefinitionAgent(BaseAgent):
    name = "DefinitionAgent"
    use_citation_enforcer = True
    use_hallucination_guard = False

    def system_prompt(self) -> str:
        return load_prompt("definition_agent_system")

    def expose_tools(self) -> list[str]:
        # Definitions never touch metric data — RAG only.
        return ["search_documents", "list_recent_changes"]
