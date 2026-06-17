"""
BenchmarkingAgent — compares the customer's metric value to peer averages.

For now peer data comes from the in-process mock in `app.tools.peer_benchmarks`.
Once the peer-benchmark service exists, the tool registry can swap to the real
HTTP client without changes here.
"""
from __future__ import annotations

from app.agents.base import BaseAgent
from app.prompts.prompts import load_prompt


class BenchmarkingAgent(BaseAgent):
    name = "BenchmarkingAgent"
    use_citation_enforcer = True
    use_hallucination_guard = True

    def system_prompt(self) -> str:
        return load_prompt("benchmarking_agent_system")

    def expose_tools(self) -> list[str]:
        return ["get_metric", "get_peer_benchmarks"]
