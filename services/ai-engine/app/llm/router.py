"""LLMRouter — gateway over OpenAI with per-task model routing.

Public surface (preserved across the LiteLLM → OpenAI migration):

  * ``LLMRouter.route(task, messages, tools=None, response_format=None, ...)``
    → ``dict`` with keys: ``content, tool_calls, model, prompt_tokens,
    completion_tokens, latency_ms, cost``. This is the new canonical method
    expected by callers that build their own request payloads.

  * ``LLMRouter.chat(task, messages, ...)`` → ``LLMResult`` — kept for
    backward compatibility with the existing agents (document_classifier,
    entity_extraction_agent, validation_agent). It is implemented as a thin
    wrapper around ``route`` and returns the same ``LLMResult`` dataclass
    as before so its consumers don't need to change.

Behaviour:
  * primary + fallback model per task (from ``Settings.model_router_config``)
  * tenacity retries with exponential backoff on 429 + 5xx
  * automatic switch to fallback after persistent failure
  * cost + token + latency tracking via ``app.llm.openai_helper``
  * tenant_id hashed (sha256/16) before any log emission
  * structlog for canonical logs + best-effort Langfuse trace
  * supports ``response_format={"type":"json_object"}`` and
    ``{"type":"json_schema","json_schema":{...}}``
  * supports OpenAI tool calls (``tools=[{type:"function",...}]``)
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
)
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import TaskType, get_settings
from app.llm.openai_helper import (
    count_message_tokens,
    estimate_cost,
)
from app.utils.logging import get_logger

logger = get_logger("llm.router")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class LLMError(RuntimeError):
    """Base class for any error surfaced out of the router."""


class LLMRateLimited(LLMError):
    """429 from upstream — retryable."""


class LLMTransient(LLMError):
    """5xx / timeout / connection error — retryable."""


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class LLMCall:
    """Telemetry for a single completed call."""

    task: str
    model: str
    prompt_version: str = ""
    tenant_hash: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    cost_usd: float = 0.0
    succeeded: bool = True
    error: Optional[str] = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResult:
    """Returned by the legacy ``chat()`` method.

    ``text`` is the assistant content (may be empty if the model only emitted
    a tool call). ``parsed`` is the structured payload after JSON / tool-call
    decoding. ``raw`` is the original response as a dict.
    """

    text: str
    parsed: Any = None
    raw: dict[str, Any] = field(default_factory=dict)
    call: LLMCall = field(default_factory=lambda: LLMCall(task="", model=""))


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def _hash_tenant(tenant_id: str) -> str:
    return hashlib.sha256(tenant_id.encode()).hexdigest()[:16] if tenant_id else ""


def _ensure_json_keyword(
    messages: list[dict[str, Any]],
    response_format: Optional[dict[str, Any]],
) -> list[dict[str, Any]]:
    """When `response_format=json_object`, OpenAI requires the literal word
    'json' to appear in the messages — otherwise the call 400s. We append a
    tiny system-level reminder rather than mutating the caller's prompts.
    """
    if not response_format:
        return messages
    if response_format.get("type") != "json_object":
        return messages
    flat = " ".join(
        str(m.get("content") or "") if not isinstance(m.get("content"), list)
        else " ".join(str(p.get("text") or "") for p in m["content"] if isinstance(p, dict))
        for m in messages
    ).lower()
    if "json" in flat:
        return messages
    return list(messages) + [
        {"role": "system", "content": "Respond with a JSON object only."}
    ]


def _classify_openai_error(exc: BaseException) -> LLMError:
    """Translate openai SDK exceptions to our internal hierarchy."""
    msg = str(exc)
    if isinstance(exc, RateLimitError):
        return LLMRateLimited(msg)
    if isinstance(exc, (APITimeoutError, APIConnectionError, InternalServerError)):
        return LLMTransient(msg)
    if isinstance(exc, APIStatusError):
        # 5xx → transient; everything else → hard fail
        status = getattr(exc, "status_code", None) or 0
        if 500 <= int(status) < 600:
            return LLMTransient(msg)
        return LLMError(msg)
    # Unknown — be conservative and surface as hard.
    return LLMError(msg)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


class LLMRouter:
    """Per-process singleton that wraps an AsyncOpenAI client."""

    def __init__(self) -> None:
        self.s = get_settings()

        client_kwargs: dict[str, Any] = {
            "api_key": self.s.OPENAI_API_KEY or "missing",
            "timeout": float(self.s.EXTRACTION_TIMEOUT_SECONDS),
            "max_retries": 0,  # we own retries via tenacity
        }
        if self.s.OPENAI_BASE_URL:
            client_kwargs["base_url"] = self.s.OPENAI_BASE_URL
        if self.s.OPENAI_ORG_ID:
            client_kwargs["organization"] = self.s.OPENAI_ORG_ID
        if self.s.OPENAI_PROJECT_ID:
            client_kwargs["project"] = self.s.OPENAI_PROJECT_ID

        self._client = AsyncOpenAI(**client_kwargs)

    # ------------------------------------------------------------------
    # Internal — config lookup
    # ------------------------------------------------------------------
    def _route_cfg(self, task: TaskType) -> dict[str, Any]:
        return self.s.model_router_config[task.value]

    # ------------------------------------------------------------------
    # Public — canonical entrypoint
    # ------------------------------------------------------------------
    async def route(
        self,
        task: TaskType,
        messages: list[dict[str, Any]],
        *,
        tools: Optional[list[dict[str, Any]]] = None,
        response_format: Optional[dict[str, Any]] = None,
        tool_choice: Optional[Any] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        prompt_version: str = "",
        tenant_id: str = "",
        extra_meta: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Run a chat completion with primary→fallback routing.

        Returns:
            dict with keys::

                content              -- assistant text (str, may be "")
                tool_calls           -- list of OpenAI tool-call dicts
                parsed               -- json.loads(content) when applicable
                model                -- the model that produced the response
                prompt_tokens        -- int
                completion_tokens    -- int
                latency_ms           -- int
                cost                 -- float (USD)
                raw                  -- full response dict
                call                 -- LLMCall telemetry record
        """
        cfg = self._route_cfg(task)
        primary = cfg["primary"]
        fallback = cfg.get("fallback")
        temp = temperature if temperature is not None else cfg.get("temperature", 0.0)
        mtok = max_tokens if max_tokens is not None else cfg.get("max_tokens", 1024)
        max_retries = int(cfg.get("max_retries", 2))

        last_err: BaseException | None = None
        for model in [primary, fallback]:
            if model is None:
                continue
            try:
                return await self._call_with_retry(
                    model=model,
                    messages=messages,
                    task=task,
                    prompt_version=prompt_version,
                    tenant_id=tenant_id,
                    response_format=response_format,
                    tools=tools,
                    tool_choice=tool_choice,
                    temperature=temp,
                    max_tokens=mtok,
                    max_retries=max_retries,
                    extra_meta=extra_meta or {},
                )
            except (LLMRateLimited, LLMTransient) as e:
                last_err = e
                logger.warning(
                    "llm.fallback",
                    task=task.value,
                    from_model=model,
                    err=str(e),
                )
                continue
            except LLMError as e:
                last_err = e
                logger.warning(
                    "llm.error_falling_back",
                    task=task.value,
                    from_model=model,
                    err=str(e),
                )
                continue

        raise LLMError(f"LLM call failed for task={task.value}: {last_err}")

    # ------------------------------------------------------------------
    # Public — legacy entrypoint kept for the existing agents.
    # ------------------------------------------------------------------
    async def chat(
        self,
        task: TaskType,
        messages: list[dict[str, Any]],
        *,
        prompt_version: str = "",
        tenant_id: str = "",
        json_mode: bool = False,
        response_schema: Optional[dict[str, Any]] = None,
        response_format: Optional[dict[str, Any]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        extra_meta: Optional[dict[str, Any]] = None,
    ) -> LLMResult:
        """Thin compatibility wrapper around :meth:`route`.

        Accepts the old kwargs (``json_mode``, ``response_schema``) used by
        the agents and translates them into the OpenAI ``response_format``.

        Returns an :class:`LLMResult` with ``parsed`` populated either from
        the assistant content (json-mode / json_schema) or from the first
        tool call's arguments.
        """
        rf: Optional[dict[str, Any]] = response_format

        if rf is None and response_schema is not None:
            # Translate legacy ``response_schema`` (a JSON-Schema dict) into
            # OpenAI's ``response_format`` payload. We import lazily because
            # the helper depends on tiktoken which we want to import once.
            from app.llm.openai_helper import json_schema_to_response_format

            rf = json_schema_to_response_format(
                response_schema,
                name="result",
                strict=False,
            )
        elif rf is None and json_mode:
            rf = {"type": "json_object"}

        result = await self.route(
            task=task,
            messages=messages,
            tools=tools,
            response_format=rf,
            temperature=temperature,
            max_tokens=max_tokens,
            prompt_version=prompt_version,
            tenant_id=tenant_id,
            extra_meta=extra_meta,
        )

        text: str = result.get("content") or ""
        parsed: Any = result.get("parsed")

        # If structured output was requested but parsing happened upstream,
        # ``parsed`` is already set. Otherwise try JSON-decoding the content.
        if parsed is None and text and (rf or json_mode):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None

        # Fallback: caller asked for tool-only output (no response_format),
        # but the model returned a single tool call → expose its arguments.
        if parsed is None:
            tool_calls = result.get("tool_calls") or []
            if tool_calls:
                args = tool_calls[0].get("function", {}).get("arguments")
                if isinstance(args, str):
                    try:
                        parsed = json.loads(args)
                    except json.JSONDecodeError:
                        parsed = None
                elif isinstance(args, dict):
                    parsed = args

        return LLMResult(
            text=text,
            parsed=parsed,
            raw=result.get("raw") or {},
            call=result["call"],
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    async def _call_with_retry(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        task: TaskType,
        prompt_version: str,
        tenant_id: str,
        response_format: Optional[dict[str, Any]],
        tools: Optional[list[dict[str, Any]]],
        tool_choice: Optional[Any],
        temperature: float,
        max_tokens: int,
        max_retries: int,
        extra_meta: dict[str, Any],
    ) -> dict[str, Any]:
        # tenacity needs at least one attempt; guard against pathological 0.
        attempts = max(1, max_retries)
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(attempts),
            wait=wait_exponential(multiplier=0.5, min=0.5, max=8.0),
            retry=retry_if_exception_type((LLMRateLimited, LLMTransient)),
            reraise=True,
        ):
            with attempt:
                return await self._raw_call(
                    model=model,
                    messages=messages,
                    task=task,
                    prompt_version=prompt_version,
                    tenant_id=tenant_id,
                    response_format=response_format,
                    tools=tools,
                    tool_choice=tool_choice,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    extra_meta=extra_meta,
                )
        # Unreachable — AsyncRetrying(reraise=True) propagates the last error.
        raise LLMError("unreachable")

    async def _raw_call(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        task: TaskType,
        prompt_version: str,
        tenant_id: str,
        response_format: Optional[dict[str, Any]],
        tools: Optional[list[dict[str, Any]]],
        tool_choice: Optional[Any],
        temperature: float,
        max_tokens: int,
        extra_meta: dict[str, Any],
    ) -> dict[str, Any]:
        t0 = time.perf_counter()

        # ----- Model-family parameter adapter -----
        # GPT-5 / o1 / o3 / o4 families enforce three constraints that the
        # legacy chat-completions kwargs violate:
        #   1. `max_tokens` is rejected → must use `max_completion_tokens`
        #   2. `temperature` only accepts the default (1.0)
        #   3. `response_format=json_object` requires the literal word "json"
        #      to appear somewhere in the messages
        # Skipping any of these returns a hard 400 and the doc lands in
        # REVIEW_NEEDED with zero fields. Apply the adapter before sending.
        is_strict_family = model.startswith(("gpt-5", "o1", "o3", "o4"))

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": _ensure_json_keyword(messages, response_format),
        }
        if is_strict_family:
            kwargs["max_completion_tokens"] = max_tokens
            # Omit `temperature` entirely — sending even 1.0 is fine, but
            # omitting matches the default and is forward-compatible.
        else:
            kwargs["temperature"] = temperature
            kwargs["max_tokens"] = max_tokens

        if response_format is not None:
            kwargs["response_format"] = response_format
        if tools:
            kwargs["tools"] = tools
            if tool_choice is not None:
                kwargs["tool_choice"] = tool_choice

        try:
            resp = await self._client.chat.completions.create(**kwargs)
        except BaseException as e:  # noqa: BLE001
            translated = _classify_openai_error(e)
            latency_ms = int((time.perf_counter() - t0) * 1000)
            call = LLMCall(
                task=task.value,
                model=model,
                prompt_version=prompt_version,
                tenant_hash=_hash_tenant(tenant_id),
                latency_ms=latency_ms,
                succeeded=False,
                error=str(e),
                meta=extra_meta,
            )
            self._log_call(call)
            raise translated from e

        latency_ms = int((time.perf_counter() - t0) * 1000)

        # ------------------------------------------------------------------
        # Parse the response
        # ------------------------------------------------------------------
        try:
            choice = resp.choices[0]
            message = choice.message
            content: str = (message.content or "") if message else ""

            tool_calls_raw = getattr(message, "tool_calls", None) or []
            tool_calls: list[dict[str, Any]] = []
            for tc in tool_calls_raw:
                fn = getattr(tc, "function", None)
                tool_calls.append(
                    {
                        "id": getattr(tc, "id", None),
                        "type": getattr(tc, "type", "function"),
                        "function": {
                            "name": getattr(fn, "name", "") if fn else "",
                            "arguments": getattr(fn, "arguments", "") if fn else "",
                        },
                    }
                )
        except Exception as e:  # noqa: BLE001
            raise LLMError(f"Could not parse LLM response: {e}") from e

        # ------------------------------------------------------------------
        # Best-effort structured parse: if caller asked for any json* response
        # format and the model returned content, try to parse it.
        # ------------------------------------------------------------------
        parsed: Any = None
        if response_format and content:
            rf_type = response_format.get("type")
            if rf_type in ("json_object", "json_schema"):
                try:
                    parsed = json.loads(content)
                except json.JSONDecodeError:
                    parsed = None

        # ------------------------------------------------------------------
        # Token usage + cost
        # ------------------------------------------------------------------
        usage = getattr(resp, "usage", None)
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        if prompt_tokens == 0 and not usage:
            # Usage missing → fall back to local count for telemetry.
            prompt_tokens = count_message_tokens(messages, model=model)
        cost = estimate_cost(model, prompt_tokens, completion_tokens)

        call = LLMCall(
            task=task.value,
            model=model,
            prompt_version=prompt_version,
            tenant_hash=_hash_tenant(tenant_id),
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens,
            latency_ms=latency_ms,
            cost_usd=cost,
            succeeded=True,
            meta=extra_meta,
        )
        self._log_call(call)

        try:
            raw_dump: dict[str, Any] = resp.model_dump()
        except Exception:  # pragma: no cover
            raw_dump = {}

        return {
            "content": content,
            "tool_calls": tool_calls,
            "parsed": parsed,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "latency_ms": latency_ms,
            "cost": cost,
            "raw": raw_dump,
            "call": call,
        }

    # ------------------------------------------------------------------
    # Logging / observability
    # ------------------------------------------------------------------
    def _log_call(self, call: LLMCall) -> None:
        logger.info(
            "llm.call",
            task=call.task,
            model=call.model,
            prompt_version=call.prompt_version,
            tenant=call.tenant_hash,
            input_tokens=call.input_tokens,
            output_tokens=call.output_tokens,
            cost_usd=round(call.cost_usd, 6),
            latency_ms=call.latency_ms,
            ok=call.succeeded,
            err=call.error,
        )
        # Best-effort Langfuse trace — fire-and-forget so a Langfuse outage
        # never blocks the request path.
        if not (self.s.LANGFUSE_PUBLIC_KEY and self.s.LANGFUSE_SECRET_KEY):
            return
        try:
            from langfuse import Langfuse  # type: ignore[import-not-found]

            lf = Langfuse(
                public_key=self.s.LANGFUSE_PUBLIC_KEY,
                secret_key=self.s.LANGFUSE_SECRET_KEY,
                host=self.s.LANGFUSE_HOST,
            )
            lf.trace(
                name=f"llm.{call.task}",
                metadata={
                    "model": call.model,
                    "prompt_version": call.prompt_version,
                    "tenant_hash": call.tenant_hash,
                    "input_tokens": call.input_tokens,
                    "output_tokens": call.output_tokens,
                    "cost_usd": call.cost_usd,
                    "latency_ms": call.latency_ms,
                    "ok": call.succeeded,
                    **call.meta,
                },
            )
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------


_router: Optional[LLMRouter] = None


def get_router() -> LLMRouter:
    """Return a process-singleton LLMRouter.

    Constructed lazily so importing this module does not require a valid
    OPENAI_API_KEY (handy in unit tests).
    """
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
