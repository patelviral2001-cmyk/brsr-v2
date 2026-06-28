"""LLM fallback provider (GPT-4o) behind an interface.

Used ONLY for canonical fields the dictionary could not resolve. Returns
{canonical_label: (value, confidence)}. When no API key is configured, the
factory returns None and the mapper skips the fallback entirely — the platform
runs fully on the deterministic dictionary path.

Locked decision (carried from esg-os-v1): provider = OpenAI GPT-4o, configurable.
"""
from __future__ import annotations

import json
import os
from typing import Optional

try:                                              # pragma: no cover - env dependent
    from openai import OpenAI
    _LIB = True
except Exception:
    OpenAI = None                                 # type: ignore
    _LIB = False

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")


class OpenAILLMProvider:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self._client = OpenAI(api_key=self.api_key) if (_LIB and self.api_key) else None

    def available(self) -> bool:
        return self._client is not None

    def fill(self, text: str, doc_type: str, missing: list[str]) -> dict:
        if not self.available() or not missing:
            return {}
        prompt = (
            "You extract specific fields from an Indian energy bill. "
            "Return STRICT JSON mapping each requested canonical field to "
            '{"value": <string|number|null>, "confidence": <0..1>}. '
            "Use null if not present. Do not invent values.\n\n"
            f"document_type: {doc_type}\nrequested_fields: {missing}\n\n"
            f"BILL TEXT:\n{text[:6000]}")
        try:
            resp = self._client.chat.completions.create(
                model=MODEL, temperature=0,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}])
            data = json.loads(resp.choices[0].message.content)
        except Exception:
            return {}
        out = {}
        for label in missing:
            entry = data.get(label)
            if isinstance(entry, dict) and entry.get("value") not in (None, ""):
                out[label] = (entry["value"], float(entry.get("confidence", 0.6)))
        return out


def get_llm() -> Optional["OpenAILLMProvider"]:
    p = OpenAILLMProvider()
    return p if p.available() else None
