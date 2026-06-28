"""
Structured logging + Langfuse tracing.

We use structlog for human-readable logs in dev and JSON-formatted logs in prod.
Langfuse is opt-in: traces only flow if both keys are configured.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any

import structlog

from app.config import Settings


_LANGFUSE_CLIENT: Any | None = None


def configure_logging(level: str, env: str) -> None:
    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    if env == "development":
        processors.append(structlog.dev.ConsoleRenderer(colors=True))
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def configure_tracing(settings: Settings) -> None:
    global _LANGFUSE_CLIENT
    if not settings.langfuse_enabled:
        return
    try:
        from langfuse import Langfuse

        _LANGFUSE_CLIENT = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
    except Exception:  # pragma: no cover - tracing must never crash the service
        structlog.get_logger("copilot.observability").exception(
            "langfuse_init_failed"
        )
        _LANGFUSE_CLIENT = None


def get_langfuse() -> Any | None:
    return _LANGFUSE_CLIENT


def hash_tenant_id(tenant_id: str) -> str:
    """
    Hash tenant IDs before sending to Langfuse so we never store the raw value.
    """
    if not tenant_id:
        return ""
    return hashlib.sha256(f"brsr-v2|{tenant_id}".encode("utf-8")).hexdigest()[:16]
