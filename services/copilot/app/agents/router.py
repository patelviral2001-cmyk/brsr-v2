"""
Intent router — classifies the user query into one of seven intents and
dispatches to the right sub-agent. Implemented as a LangGraph state machine
so we can add side branches (e.g. clarification loops) without rewriting.
"""
from __future__ import annotations

from typing import AsyncIterator, Literal

import structlog
from anthropic import AsyncAnthropic
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from app.agents.analytical_agent import AnalyticalAgent
from app.agents.benchmarking_agent import BenchmarkingAgent
from app.agents.completeness_agent import CompletenessAgent
from app.agents.definition_agent import DefinitionAgent
from app.agents.provenance_agent import ProvenanceAgent
from app.agents.writer_agent import WriterAgent
from app.auth import Principal
from app.config import get_settings
from app.prompts.prompts import load_prompt

log = structlog.get_logger("copilot.agents.router")


Intent = Literal[
    "DEFINITION",
    "ANALYTICAL",
    "WRITER",
    "COMPLETENESS",
    "BENCHMARKING",
    "PROVENANCE",
    "GENERAL",
]


_VALID_INTENTS = {
    "DEFINITION",
    "ANALYTICAL",
    "WRITER",
    "COMPLETENESS",
    "BENCHMARKING",
    "PROVENANCE",
    "GENERAL",
}


class RouterState(BaseModel):
    query: str
    intent: Intent | None = None


class IntentRouter:
    """
    Two-stage routing:
      1) Fast classification with Haiku.
      2) Dispatch to the sub-agent, which streams its output.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.anthropic = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        self._graph = self._build_graph()

        # Lazy-construct agents to keep router cold-start cheap.
        self._agents = {
            "DEFINITION": DefinitionAgent,
            "ANALYTICAL": AnalyticalAgent,
            "WRITER": WriterAgent,
            "COMPLETENESS": CompletenessAgent,
            "BENCHMARKING": BenchmarkingAgent,
            "PROVENANCE": ProvenanceAgent,
            "GENERAL": DefinitionAgent,  # GENERAL falls back to RAG
        }

    def _build_graph(self) -> StateGraph:
        g = StateGraph(RouterState)
        g.add_node("classify", self._classify_node)
        g.add_edge(START, "classify")
        g.add_edge("classify", END)
        return g.compile()

    async def _classify_node(self, state: RouterState) -> RouterState:
        state.intent = await self.classify(state.query)
        return state

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=0.25, max=3.0),
        reraise=True,
    )
    async def classify(self, query: str, principal: Principal | None = None) -> Intent:
        # Cheap heuristic short-circuits to avoid the LLM round-trip when obvious.
        ql = query.lower().strip()
        if ql.startswith(("what is", "define", "explain the term")):
            return "DEFINITION"
        if ql.startswith(("why is", "why did", "what changed", "compare to")):
            return "ANALYTICAL"
        if "generate" in ql and ("narrative" in ql or "paragraph" in ql or "section" in ql):
            return "WRITER"
        if "missing" in ql or "completeness" in ql or "what's left" in ql:
            return "COMPLETENESS"
        if "peers" in ql or "benchmark" in ql or "industry average" in ql:
            return "BENCHMARKING"
        if "how was" in ql and "calculated" in ql:
            return "PROVENANCE"
        if "show me how" in ql and ("computed" in ql or "calculated" in ql):
            return "PROVENANCE"

        system = load_prompt("router_classify_system")
        msg = await self.anthropic.messages.create(
            model=self.settings.anthropic_fast_model,
            max_tokens=20,
            system=system,
            messages=[{"role": "user", "content": query}],
            temperature=0.0,
        )
        # Claude returns a list of content blocks; grab the first text block.
        text = ""
        for block in msg.content:
            if getattr(block, "type", None) == "text":
                text = block.text.strip().upper()
                break
        if text in _VALID_INTENTS:
            return text  # type: ignore[return-value]
        return "GENERAL"

    async def dispatch_stream(
        self,
        *,
        intent: Intent,
        messages: list[dict],
        principal: Principal,
        fiscal_year: str | None,
        framework: str | None,
        section_id: str | None,
    ) -> AsyncIterator[dict]:
        """Yield stream chunks of the form {"type": str, "data": dict}."""
        AgentCls = self._agents.get(intent, DefinitionAgent)
        agent = AgentCls()
        async for chunk in agent.stream(
            messages=messages,
            principal=principal,
            fiscal_year=fiscal_year,
            framework=framework,
            section_id=section_id,
        ):
            yield chunk
