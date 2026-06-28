"""Structlog configuration — JSON output in prod, console renderer in dev.

Public helpers:
  * configure_logging()       — call once at startup
  * get_logger(name)          — bound structlog logger
  * hash_tenant(tenant_id)    — stable sha256[:16] hash for log correlation
  * redact_pii(text)          — best-effort PII scrubber for free-form strings
  * log_extraction(...)       — canonical structured emit for every extraction

We deliberately keep the canonical extraction event schema in one place so the
log pipeline / dashboards can rely on consistent keys.
"""
from __future__ import annotations

import hashlib
import logging
import re
import sys
from typing import Any, Iterable

import structlog

from app.config import get_settings


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.ENV == "dev":
        processors = shared_processors + [structlog.dev.ConsoleRenderer()]
    else:
        processors = shared_processors + [structlog.processors.JSONRenderer()]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Tenant hashing
# ---------------------------------------------------------------------------


def hash_tenant(tenant_id: str | None) -> str:
    """Return a sha256[:16] hex digest of the tenant id, or "" if missing.

    We never log the raw tenant id — only this hash — so that log dumps
    remain non-PII even if the org name is encoded in the tenant id.
    """
    if not tenant_id:
        return ""
    return hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# PII redaction
# ---------------------------------------------------------------------------


_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# Indian phone numbers: optional +91, optional space/hyphen, 10 digits starting 6-9.
_PHONE_RE = re.compile(r"(?:(?:\+?91[\-\s]?)|0)?[6-9]\d{9}")
# PAN: 5 letters + 4 digits + 1 letter (e.g. AAAPL1234C).
_PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
# Aadhaar: 12 digits, often in groups of 4.
_AADHAAR_RE = re.compile(r"\b\d{4}[\-\s]?\d{4}[\-\s]?\d{4}\b")
# Credit card: 13-19 digit run (very rough but useful for log scrubbing).
_CARD_RE = re.compile(r"\b(?:\d[ \-]?){13,19}\b")
# Bearer tokens / API keys (common shapes).
_BEARER_RE = re.compile(r"(?i)Bearer\s+[A-Za-z0-9._\-]+")
_OPENAI_KEY_RE = re.compile(r"sk-[A-Za-z0-9]{20,}")


def redact_pii(text: str | None) -> str:
    """Scrub common PII shapes from a free-form string.

    This is intentionally conservative — false-positives are preferred over
    leaks. Use it before logging any raw user text (OCR output, prompts,
    error messages from upstream).
    """
    if not text:
        return ""
    s = str(text)
    s = _OPENAI_KEY_RE.sub("[REDACTED_API_KEY]", s)
    s = _BEARER_RE.sub("Bearer [REDACTED]", s)
    s = _EMAIL_RE.sub("[REDACTED_EMAIL]", s)
    s = _AADHAAR_RE.sub("[REDACTED_AADHAAR]", s)
    s = _PAN_RE.sub("[REDACTED_PAN]", s)
    s = _CARD_RE.sub("[REDACTED_CARD]", s)
    s = _PHONE_RE.sub("[REDACTED_PHONE]", s)
    return s


def redact_dict(payload: dict[str, Any], *, sensitive_keys: Iterable[str] = ()) -> dict[str, Any]:
    """Return a shallow-redacted copy of ``payload`` suitable for logging."""
    blocked = {k.lower() for k in sensitive_keys} | {
        "authorization",
        "x-internal-secret",
        "x-callback-secret",
        "openai_api_key",
        "anthropic_api_key",
        "s3_secret_key",
        "qdrant_api_key",
        "backend_callback_secret",
        "secret",
        "password",
        "token",
        "api_key",
    }
    out: dict[str, Any] = {}
    for k, v in payload.items():
        if k.lower() in blocked:
            out[k] = "[REDACTED]"
        elif isinstance(v, str):
            out[k] = redact_pii(v)
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
# Canonical extraction-event emit
# ---------------------------------------------------------------------------


_EXTRACTION_LOGGER = get_logger("extraction.event")


def log_extraction(
    *,
    tenant_id: str,
    document_id: str,
    model_used: str | None,
    tokens_in: int,
    tokens_out: int,
    latency_ms: int,
    status: str,
    cost_usd: float = 0.0,
    error: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Emit a single canonical JSON event for an extraction.

    Fields are stable so the log pipeline / Grafana can rely on them:
      tenant_hash, document_id, model_used, tokens_in, tokens_out,
      latency_ms, status, cost_usd, error
    """
    payload: dict[str, Any] = {
        "tenant_hash": hash_tenant(tenant_id),
        "document_id": document_id,
        "model_used": model_used,
        "tokens_in": int(tokens_in or 0),
        "tokens_out": int(tokens_out or 0),
        "latency_ms": int(latency_ms or 0),
        "status": status,
        "cost_usd": round(float(cost_usd or 0.0), 6),
        "error": redact_pii(error) if error else None,
    }
    if extra:
        payload.update(redact_dict(extra))
    _EXTRACTION_LOGGER.info("extraction.completed", **payload)
