"""
Chat endpoints.

POST /chat          -> SSE stream of tokens (production path)
POST /chat/sync     -> full JSON response (tests, non-browser clients)

Tenant ID is extracted from the JWT in the Authorization header. The intent
router classifies the query and dispatches to the appropriate sub-agent.
"""
from __future__ import annotations

import uuid
from typing import AsyncIterator, Literal

import structlog
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.agents.router import IntentRouter, Intent
from app.auth import Principal, require_principal
from app.observability import hash_tenant_id

log = structlog.get_logger("copilot.router.chat")
router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    # Optional context the frontend passes (current fiscal year, framework focus, etc.)
    fiscal_year: str | None = Field(default=None, pattern=r"^FY\d{2}-\d{2}$")
    framework: Literal["BRSR", "GRI", "SASB", "TCFD", "IFRS_S1", "IFRS_S2", "CSRD_ESRS", "CDP"] | None = None
    section_id: str | None = None
    # Lets a client force a specific intent for debugging
    force_intent: Intent | None = None


class StreamEvent(BaseModel):
    type: Literal["token", "tool_use", "citation", "intent", "error", "done"]
    data: dict


@router.post("", summary="Stream a Copilot response via SSE")
async def chat_sse(
    request: Request,
    body: ChatRequest,
    principal: Principal = Depends(require_principal),
):
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        tenant=hash_tenant_id(principal.tenant_id),
        intent_forced=body.force_intent,
    )

    router_agent = IntentRouter()

    async def event_gen() -> AsyncIterator[dict]:
        try:
            intent = body.force_intent or await router_agent.classify(
                body.messages[-1].content, principal=principal
            )
            yield {
                "event": "intent",
                "data": StreamEvent(type="intent", data={"intent": intent}).model_dump_json(),
            }

            async for chunk in router_agent.dispatch_stream(
                intent=intent,
                messages=[m.model_dump() for m in body.messages],
                principal=principal,
                fiscal_year=body.fiscal_year,
                framework=body.framework,
                section_id=body.section_id,
            ):
                yield {
                    "event": chunk["type"],
                    "data": StreamEvent(**chunk).model_dump_json(),
                }

            yield {
                "event": "done",
                "data": StreamEvent(type="done", data={"request_id": request_id}).model_dump_json(),
            }
        except Exception as exc:
            log.exception("chat_stream_failed")
            yield {
                "event": "error",
                "data": StreamEvent(
                    type="error", data={"message": str(exc), "request_id": request_id}
                ).model_dump_json(),
            }

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",  # disable nginx buffering
        "X-Request-Id": request_id,
    }
    return EventSourceResponse(event_gen(), headers=headers)


@router.post("/sync", summary="Non-streaming chat — convenience for tests")
async def chat_sync(
    request: Request,
    body: ChatRequest,
    principal: Principal = Depends(require_principal),
):
    """Accumulates the SSE stream into a single JSON response."""
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    router_agent = IntentRouter()
    intent = body.force_intent or await router_agent.classify(
        body.messages[-1].content, principal=principal
    )
    tokens: list[str] = []
    tool_uses: list[dict] = []
    citations: list[dict] = []
    async for chunk in router_agent.dispatch_stream(
        intent=intent,
        messages=[m.model_dump() for m in body.messages],
        principal=principal,
        fiscal_year=body.fiscal_year,
        framework=body.framework,
        section_id=body.section_id,
    ):
        ctype = chunk["type"]
        data = chunk["data"]
        if ctype == "token":
            tokens.append(data.get("text", ""))
        elif ctype == "tool_use":
            tool_uses.append(data)
        elif ctype == "citation":
            citations.append(data)

    return {
        "request_id": request_id,
        "intent": intent,
        "answer": "".join(tokens),
        "tool_uses": tool_uses,
        "citations": citations,
    }
