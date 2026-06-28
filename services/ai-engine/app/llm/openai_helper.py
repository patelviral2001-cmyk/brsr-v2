"""OpenAI-specific helpers shared by the router and agents.

This module centralises:
  * Token counting via tiktoken (with a graceful fallback when the model is
    not yet in tiktoken's registry — common for brand-new GPT-5 names).
  * Cost estimation per OpenAI's published pricing (per-million-token rates,
    distinguishing input vs output).
  * A helper to convert a Pydantic v2 model (or a raw JSON Schema dict) into
    the ``response_format`` payload that OpenAI's structured-outputs API
    expects (``{"type": "json_schema", "json_schema": {...}}``).
  * A helper to compose chat messages from a system prompt + few-shot
    examples + a user payload, which keeps prompts consistent across agents.

Pricing is a moving target; the rates below match the public list price at
the time of writing. They are used purely for telemetry — cost reporting,
not billing — so a small drift is acceptable. Override via env if needed.
"""
from __future__ import annotations

import json
from typing import Any, Iterable, Mapping, Sequence

try:  # tiktoken is a hard dep but importing inside a try/except keeps the
    # helper usable in extremely minimal test environments.
    import tiktoken
except Exception:  # pragma: no cover - tiktoken is in requirements
    tiktoken = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Pricing — USD per 1M tokens (input, output).
# Source: OpenAI public pricing page; update when OpenAI changes prices.
# Unknown models fall back to PRICING_DEFAULT.
# ---------------------------------------------------------------------------

PRICING_PER_MTOK: dict[str, tuple[float, float]] = {
    # GPT-5 family
    "gpt-5": (2.50, 10.00),
    "gpt-5-mini": (0.25, 2.00),
    "gpt-5-nano": (0.10, 0.40),
    # GPT-4o family — used as fallback tier
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    # GPT-4.1 family — also seen as fallback
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    # Legacy
    "gpt-4-turbo": (10.0, 30.0),
    "gpt-3.5-turbo": (0.50, 1.50),
}

# Embeddings — USD per 1M tokens, single price (no output side).
EMBEDDING_PRICING_PER_MTOK: dict[str, float] = {
    "text-embedding-3-large": 0.13,
    "text-embedding-3-small": 0.02,
    "text-embedding-ada-002": 0.10,
}

PRICING_DEFAULT: tuple[float, float] = (2.50, 10.00)


# ---------------------------------------------------------------------------
# Token counting
# ---------------------------------------------------------------------------


def _encoding_for(model: str) -> "tiktoken.Encoding | None":  # type: ignore[name-defined]
    """Best-effort tiktoken encoder for the given model name.

    GPT-5 models aren't in tiktoken's static registry yet — they share the
    o200k_base encoding with GPT-4o, so we route unknown ``gpt-5*`` /
    ``gpt-4o*`` names there explicitly.
    """
    if tiktoken is None:
        return None
    try:
        return tiktoken.encoding_for_model(model)
    except Exception:
        # GPT-5 + GPT-4o share o200k_base; everything older uses cl100k_base.
        if model.startswith(("gpt-5", "gpt-4o", "gpt-4.1", "o1", "o3", "o4")):
            try:
                return tiktoken.get_encoding("o200k_base")
            except Exception:
                pass
        try:
            return tiktoken.get_encoding("cl100k_base")
        except Exception:
            return None


def count_tokens(text: str, model: str = "gpt-5") -> int:
    """Count the number of tokens ``text`` consumes for ``model``.

    Falls back to a 4-chars-per-token heuristic when tiktoken is unavailable
    or the model can't be resolved. Empty / non-string input → 0.
    """
    if not text:
        return 0
    if not isinstance(text, str):
        text = str(text)
    enc = _encoding_for(model)
    if enc is None:
        return max(1, len(text) // 4)
    try:
        return len(enc.encode(text))
    except Exception:
        return max(1, len(text) // 4)


def count_message_tokens(
    messages: Sequence[Mapping[str, Any]],
    model: str = "gpt-5",
) -> int:
    """Approximate the total prompt-token count for a chat ``messages`` array.

    We add 4 tokens per message + 2 tokens overall as a small overhead — the
    exact value depends on the model's chat-format spec but this matches the
    documented heuristic for the o200k tokenizer family well enough for
    telemetry purposes.
    """
    total = 2
    for m in messages:
        total += 4
        content = m.get("content", "")
        if isinstance(content, list):  # multi-part content (e.g. vision)
            for part in content:
                if isinstance(part, Mapping):
                    text = part.get("text") or ""
                    total += count_tokens(str(text), model)
        else:
            total += count_tokens(str(content), model)
        for k in ("role", "name"):
            v = m.get(k)
            if v:
                total += count_tokens(str(v), model)
    return total


# ---------------------------------------------------------------------------
# Cost estimation
# ---------------------------------------------------------------------------


def estimate_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int = 0,
) -> float:
    """Return the USD cost of a single OpenAI call.

    For embedding models, ``completion_tokens`` is ignored and the single
    per-million-token rate is used.
    """
    if model in EMBEDDING_PRICING_PER_MTOK:
        rate = EMBEDDING_PRICING_PER_MTOK[model]
        return round((prompt_tokens / 1_000_000.0) * rate, 6)
    in_rate, out_rate = PRICING_PER_MTOK.get(model, PRICING_DEFAULT)
    cost = (prompt_tokens / 1_000_000.0) * in_rate + (completion_tokens / 1_000_000.0) * out_rate
    return round(cost, 6)


# ---------------------------------------------------------------------------
# Structured-outputs response_format helpers
# ---------------------------------------------------------------------------


def _strip_titles(schema: Any) -> Any:
    """Recursively drop Pydantic's ``title`` keys.

    OpenAI's strict JSON-schema mode rejects unknown / superfluous keys at
    the top level of property definitions; ``title`` is harmless but noisy
    and Pydantic emits one per field. Removing them keeps payloads small.
    """
    if isinstance(schema, dict):
        return {k: _strip_titles(v) for k, v in schema.items() if k != "title"}
    if isinstance(schema, list):
        return [_strip_titles(v) for v in schema]
    return schema


def _ensure_additional_properties_false(schema: Any) -> Any:
    """Walk an object schema and force ``additionalProperties: false``.

    Required for OpenAI's strict mode — any object node missing this key is
    rejected. We only add the key to ``type == "object"`` nodes that don't
    already specify it.
    """
    if isinstance(schema, dict):
        new = {k: _ensure_additional_properties_false(v) for k, v in schema.items()}
        if new.get("type") == "object" and "additionalProperties" not in new:
            new["additionalProperties"] = False
        return new
    if isinstance(schema, list):
        return [_ensure_additional_properties_false(v) for v in schema]
    return schema


def json_schema_to_response_format(
    schema: Mapping[str, Any],
    *,
    name: str = "result",
    strict: bool = False,
) -> dict[str, Any]:
    """Convert a raw JSON Schema dict into OpenAI's response_format payload.

    Set ``strict=True`` to opt into OpenAI's strict structured-outputs mode
    (every object gets ``additionalProperties: false``, every property is
    required). For our use case ``strict=False`` is safer because some of
    our schemas have optional fields (e.g. ``rationale``).
    """
    cleaned = _strip_titles(dict(schema))
    if strict:
        cleaned = _ensure_additional_properties_false(cleaned)
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "schema": cleaned,
            "strict": bool(strict),
        },
    }


def build_json_schema_response(
    pydantic_model: type,
    *,
    name: str | None = None,
    strict: bool = False,
) -> dict[str, Any]:
    """Build a response_format payload from a Pydantic v2 model class.

    ``pydantic_model`` must expose ``.model_json_schema()`` (Pydantic v2).
    """
    if not hasattr(pydantic_model, "model_json_schema"):
        raise TypeError(
            f"build_json_schema_response expects a Pydantic v2 model, got {pydantic_model!r}"
        )
    schema = pydantic_model.model_json_schema()
    return json_schema_to_response_format(
        schema,
        name=name or pydantic_model.__name__,
        strict=strict,
    )


# ---------------------------------------------------------------------------
# Message composition
# ---------------------------------------------------------------------------


def format_messages_with_examples(
    system_prompt: str,
    user_input: Any,
    *,
    examples: Iterable[Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Compose an OpenAI chat ``messages`` array.

    ``examples`` is an optional iterable of ``{"input": ..., "output": ...}``
    dicts which get inlined as alternating user/assistant turns. Non-string
    payloads are JSON-serialised so we don't accidentally pass an object as
    a chat message value.
    """
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    if examples:
        for ex in examples:
            inp = ex.get("input")
            out = ex.get("output")
            messages.append({"role": "user", "content": _to_text(inp)})
            messages.append({"role": "assistant", "content": _to_text(out)})
    messages.append({"role": "user", "content": _to_text(user_input)})
    return messages


def _to_text(payload: Any) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload
    try:
        return json.dumps(payload, ensure_ascii=False, default=str, indent=2)
    except Exception:
        return str(payload)
