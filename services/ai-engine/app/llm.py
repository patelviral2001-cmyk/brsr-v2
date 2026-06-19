"""LLM-driven structured extraction. One call per document, with the
document-specific pydantic schema as the response format. Falls back to a
deterministic empty result when OPENAI_API_KEY is unset (dev/offline)."""
from __future__ import annotations
import json
import logging
from typing import Optional, Type

from pydantic import BaseModel
from openai import OpenAI

from .config import get_settings
from .schemas import (
    ElectricityBillV1, DieselBillV1, WaterBillV1, PngBillV1, UnknownV1,
)

logger = logging.getLogger(__name__)


# Prompt templates per doc type — short, focused on the registry-bound fields.
PROMPTS = {
    "ELECTRICITY_BILL": (
        "You are an ESG data extractor. Read the Indian electricity bill text below and "
        "fill the ELECTRICITY_BILL_V1 fields. Convert numbers to plain decimals (no commas). "
        "Dates as YYYY-MM-DD. If a field is not present, set it to null."
    ),
    "DIESEL_BILL": (
        "You are an ESG data extractor. Read the diesel/petrol invoice text below and "
        "fill the DIESEL_BILL_V1 fields. Convert numbers to plain decimals. Dates ISO."
    ),
    "WATER_BILL": (
        "You are an ESG data extractor. Read the water bill text below and "
        "fill the WATER_BILL_V1 fields. Convert numbers to plain decimals. Dates ISO."
    ),
    "PNG_BILL": (
        "You are an ESG data extractor. Read the natural gas (PNG) bill text below and "
        "fill the PNG_BILL_V1 fields. Convert numbers to plain decimals. Dates ISO."
    ),
    "UNKNOWN": (
        "You are an ESG data extractor. Identify what this document is and return a brief summary."
    ),
}

SCHEMA_BY_DOC_TYPE: dict[str, Type[BaseModel]] = {
    "ELECTRICITY_BILL": ElectricityBillV1,
    "DIESEL_BILL":      DieselBillV1,
    "WATER_BILL":       WaterBillV1,
    "PNG_BILL":         PngBillV1,
    "UNKNOWN":          UnknownV1,
}


def extract_structured(text: str, doc_type: str) -> tuple[dict, float]:
    """Returns (payload_dict, confidence)."""
    settings = get_settings()
    schema_cls = SCHEMA_BY_DOC_TYPE.get(doc_type, UnknownV1)

    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set — returning empty payload")
        # Return an empty-but-valid payload of the right shape
        empty = schema_cls(confidence=0.0).model_dump()
        return empty, 0.0

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    prompt = PROMPTS.get(doc_type, PROMPTS["UNKNOWN"])
    # Trim very long text to keep the prompt under context
    text_snippet = text[:12_000]
    try:
        resp = client.beta.chat.completions.parse(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user",   "content": text_snippet},
            ],
            response_format=schema_cls,
            temperature=0.0,
        )
        parsed = resp.choices[0].message.parsed
        if parsed is None:
            return schema_cls(confidence=0.0).model_dump(), 0.0
        payload = parsed.model_dump()
        # Heuristic confidence: ratio of populated fields
        populated = sum(1 for k, v in payload.items() if v not in (None, "", 0, 0.0) and k != "schema_code")
        total = max(1, len(payload) - 1)
        ratio = populated / total
        confidence = min(0.99, max(0.3, ratio))     # never absolute, never zero on a real LLM reply
        payload["confidence"] = confidence
        return payload, confidence
    except Exception as e:
        logger.exception("LLM extraction failed: %s", e)
        return schema_cls(confidence=0.0).model_dump(), 0.0
