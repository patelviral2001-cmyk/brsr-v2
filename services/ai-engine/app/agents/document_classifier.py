"""Document type classifier — cheap fast-path via gpt-5-nano.

Pipeline:
  1. Extract the first 2000 chars of OCR/text preview + filename.
  2. Build prompt from classifier_v3.md.
  3. Call ``LLMRouter`` with ``TaskType.CLASSIFY`` and force a json_schema
     response so the model returns a ``ClassificationResult``-shaped object.
  4. Validate the response against the Pydantic model.
  5. Return result (or ``UNKNOWN`` with zero confidence on any failure).
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from app.agents.prompt_versions import CLASSIFIER_V3
from app.config import TaskType
from app.llm.openai_helper import json_schema_to_response_format
from app.llm.router import LLMError, get_router
from app.models.internal import ClassificationResult, DocTypeAlternative, DocTypeEnum
from app.utils.logging import get_logger

logger = get_logger("agents.classifier")


_TAXONOMY = [e.value for e in DocTypeEnum]


# Raw JSON Schema for the structured output. We convert this to OpenAI's
# ``response_format`` payload once at import time so every call reuses it.
_CLASSIFICATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "doc_type": {"type": "string", "enum": _TAXONOMY},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "alternative_types": {
            "type": "array",
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "doc_type": {"type": "string", "enum": _TAXONOMY},
                    "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                },
                "required": ["doc_type", "confidence"],
            },
        },
        "rationale": {"type": "string", "maxLength": 240},
    },
    "required": ["doc_type", "confidence"],
}

_CLASSIFICATION_RESPONSE_FORMAT = json_schema_to_response_format(
    _CLASSIFICATION_SCHEMA,
    name="ClassificationResult",
    strict=False,
)


class DocumentClassifier:
    """Wraps the classifier prompt + LLMRouter call."""

    def __init__(self) -> None:
        self.router = get_router()

    async def classify(
        self,
        *,
        filename: str,
        text_preview: str,
        tenant_id: str,
        hint: str | None = None,
    ) -> ClassificationResult:
        user_payload = {
            "filename": filename,
            "preview": (text_preview or "")[:2000],
            "doc_type_hint_from_uploader": hint,
        }
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": CLASSIFIER_V3.content},
            {"role": "user", "content": _stringify(user_payload)},
        ]
        try:
            result = await self.router.chat(
                task=TaskType.CLASSIFY,
                messages=messages,
                prompt_version=CLASSIFIER_V3.name,
                tenant_id=tenant_id,
                response_format=_CLASSIFICATION_RESPONSE_FORMAT,
            )
        except LLMError as e:
            logger.warning("classifier.llm_failed", err=str(e))
            return ClassificationResult(doc_type="UNKNOWN", confidence=0.0)

        parsed = result.parsed or {}
        try:
            doc_type = str(parsed.get("doc_type", "UNKNOWN")).upper()
            if doc_type not in _TAXONOMY:
                doc_type = "UNKNOWN"
            conf = float(parsed.get("confidence", 0.0))
            alts: list[DocTypeAlternative] = []
            for a in parsed.get("alternative_types", [])[:3]:
                if not isinstance(a, dict):
                    continue
                a_type = str(a.get("doc_type", "UNKNOWN")).upper()
                if a_type not in _TAXONOMY:
                    a_type = "UNKNOWN"
                alts.append(
                    DocTypeAlternative(
                        doc_type=a_type,
                        confidence=float(a.get("confidence", 0.0)),
                    )
                )
            return ClassificationResult(
                doc_type=doc_type,
                confidence=max(0.0, min(1.0, conf)),
                alternative_types=alts,
                rationale=parsed.get("rationale"),
            )
        except (ValidationError, ValueError, TypeError) as e:
            logger.warning("classifier.invalid_output", err=str(e), parsed=parsed)
            return ClassificationResult(doc_type="UNKNOWN", confidence=0.0)


def _stringify(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)
