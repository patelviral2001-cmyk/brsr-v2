"""
Shared base class for all sub-agents.

Encapsulates the tool-calling loop against Anthropic so each agent only has to
override the system prompt + the tools it exposes.
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

import structlog
from anthropic import AsyncAnthropic
from anthropic.types import MessageParam

from app.auth import Principal
from app.config import get_settings
from app.safety.citation_enforcer import CitationEnforcer
from app.safety.hallucination_guard import HallucinationGuard
from app.tools.registry import ToolRegistry, ToolContext


log = structlog.get_logger("copilot.agents.base")


class BaseAgent(ABC):
    """
    Common loop: send messages, react to tool_use blocks, run the tool, feed
    tool_result back, repeat until the model finishes (or we hit the cap).
    """

    name: str = "BaseAgent"
    """Logical name (for logs/traces)."""

    use_citation_enforcer: bool = True
    use_hallucination_guard: bool = False

    def __init__(self) -> None:
        self.settings = get_settings()
        self.anthropic = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        self.tools = ToolRegistry()
        self.citation_enforcer = CitationEnforcer()
        self.hallucination_guard = HallucinationGuard()

    @abstractmethod
    def system_prompt(self) -> str: ...

    def model_id(self) -> str:
        return self.settings.anthropic_primary_model

    def expose_tools(self) -> list[str]:
        """Return tool names this agent is allowed to call."""
        return [
            "get_metric",
            "get_calc_run",
            "search_documents",
            "get_framework_completion",
        ]

    async def stream(
        self,
        *,
        messages: list[dict],
        principal: Principal,
        fiscal_year: str | None,
        framework: str | None,
        section_id: str | None,
    ) -> AsyncIterator[dict]:
        tool_ctx = ToolContext(
            principal=principal,
            fiscal_year=fiscal_year,
            framework=framework,
            section_id=section_id,
        )
        anthropic_msgs: list[MessageParam] = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m["role"] in ("user", "assistant")
        ]
        tool_defs = self.tools.tool_definitions(self.expose_tools())

        # Buffers for citation enforcement
        text_buf: list[str] = []
        tool_use_log: list[dict] = []

        for turn in range(self.settings.max_tool_calls_per_turn):
            # Stream the assistant response token-by-token via streaming API.
            stream = await self.anthropic.messages.create(
                model=self.model_id(),
                max_tokens=self.settings.max_tokens_per_response,
                system=self.system_prompt(),
                tools=tool_defs,
                messages=anthropic_msgs,
                temperature=0.2,
                stream=True,
            )

            current_text: list[str] = []
            tool_uses_this_turn: list[dict] = []
            stop_reason: str | None = None

            async for event in stream:
                etype = getattr(event, "type", None)
                if etype == "content_block_start":
                    block = event.content_block
                    if block.type == "tool_use":
                        tool_uses_this_turn.append(
                            {
                                "id": block.id,
                                "name": block.name,
                                "input": {},  # filled when block_delta + stop arrive
                                "_input_partial": "",
                            }
                        )
                elif etype == "content_block_delta":
                    delta = event.delta
                    if delta.type == "text_delta":
                        text_buf.append(delta.text)
                        current_text.append(delta.text)
                        yield {"type": "token", "data": {"text": delta.text}}
                    elif delta.type == "input_json_delta":
                        if tool_uses_this_turn:
                            tool_uses_this_turn[-1]["_input_partial"] += delta.partial_json
                elif etype == "content_block_stop":
                    if tool_uses_this_turn and tool_uses_this_turn[-1]["_input_partial"]:
                        try:
                            tool_uses_this_turn[-1]["input"] = json.loads(
                                tool_uses_this_turn[-1]["_input_partial"]
                            )
                        except json.JSONDecodeError:
                            tool_uses_this_turn[-1]["input"] = {}
                        tool_uses_this_turn[-1].pop("_input_partial", None)
                elif etype == "message_delta":
                    if getattr(event.delta, "stop_reason", None):
                        stop_reason = event.delta.stop_reason
                elif etype == "message_stop":
                    break

            # If the model finished cleanly without invoking tools, we're done.
            if not tool_uses_this_turn or stop_reason == "end_turn":
                break

            # Otherwise, run the tools, feed results back, loop.
            assistant_blocks: list[dict] = []
            joined_text = "".join(current_text)
            if joined_text:
                assistant_blocks.append({"type": "text", "text": joined_text})
            for tu in tool_uses_this_turn:
                assistant_blocks.append(
                    {
                        "type": "tool_use",
                        "id": tu["id"],
                        "name": tu["name"],
                        "input": tu["input"],
                    }
                )
            anthropic_msgs.append({"role": "assistant", "content": assistant_blocks})

            tool_results: list[dict] = []
            for tu in tool_uses_this_turn:
                result = await self._safe_run_tool(tu, tool_ctx)
                tool_use_log.append(
                    {"name": tu["name"], "input": tu["input"], "result_preview": _preview(result)}
                )
                yield {
                    "type": "tool_use",
                    "data": {
                        "name": tu["name"],
                        "input": tu["input"],
                        "result_preview": _preview(result),
                    },
                }
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu["id"],
                        "content": json.dumps(result, default=str),
                    }
                )
            anthropic_msgs.append({"role": "user", "content": tool_results})

        # Post-stream safety.
        full_text = "".join(text_buf)
        if self.use_citation_enforcer:
            enforcement = self.citation_enforcer.enforce(full_text, tool_use_log)
            for cite in enforcement.citations:
                yield {"type": "citation", "data": cite}

        if self.use_hallucination_guard:
            disagreements = await self.hallucination_guard.check(
                full_text, tool_use_log, tool_ctx
            )
            for d in disagreements:
                yield {"type": "citation", "data": {"warning": d}}

    async def _safe_run_tool(
        self, tu: dict, ctx: ToolContext
    ) -> dict:
        try:
            return await self.tools.run(tu["name"], tu["input"], ctx)
        except Exception as exc:  # surface as a tool error so the model can recover
            log.exception("tool_invocation_failed", tool=tu["name"])
            return {"error": str(exc), "tool": tu["name"]}


def _preview(obj: Any, limit: int = 400) -> str:
    s = json.dumps(obj, default=str)
    return s if len(s) <= limit else (s[: limit - 3] + "...")
