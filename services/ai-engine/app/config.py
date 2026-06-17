"""Application configuration loaded from environment variables.

Uses Pydantic Settings so every value is type-checked at startup. Includes
a `model_router_config` mapping each TaskType to OpenAI models with primary
and fallback tiers (e.g. classify -> gpt-5-nano, extract -> gpt-5).

The TaskType enum and LLMRouter public surface are intentionally preserved
so that agents continue to call ``router.route(task=...)`` / ``router.chat``
without any changes when we swap providers.
"""
from __future__ import annotations

from enum import Enum
from functools import lru_cache
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TaskType(str, Enum):
    """Logical LLM task buckets — used to look up a model in the router."""

    CLASSIFY = "classify"
    EXTRACT_ENTITY = "extract_entity"
    VALIDATE_FIELD = "validate_field"
    EMBED = "embed"
    WRITE_NARRATIVE = "write_narrative"


class Settings(BaseSettings):
    """Strongly-typed runtime configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------
    # Server
    # ------------------------------------------------------------------
    PORT: int = 8100
    LOG_LEVEL: str = "INFO"
    ENV: str = "dev"
    SERVICE_NAME: str = "ai-engine"

    # ------------------------------------------------------------------
    # LLM providers
    # ------------------------------------------------------------------
    # OpenAI is the primary provider.
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""  # blank = api.openai.com; set for proxy/Azure
    OPENAI_ORG_ID: str = ""
    OPENAI_PROJECT_ID: str = ""

    # Anthropic kept as an OPTIONAL last-resort fallback (off by default).
    ANTHROPIC_API_KEY: str = ""
    ENABLE_ANTHROPIC_FALLBACK: bool = False

    # Google reserved for narrative fallbacks; unused in the main pipeline.
    GOOGLE_API_KEY: str = ""

    # ------------------------------------------------------------------
    # OpenAI model selection (per-task)
    # Each can be overridden via env without touching code.
    # ------------------------------------------------------------------
    OPENAI_MODEL_CLASSIFIER: str = "gpt-5-nano"
    OPENAI_MODEL_EXTRACTOR: str = "gpt-5"
    OPENAI_MODEL_VALIDATOR: str = "gpt-5"
    OPENAI_MODEL_NARRATIVE: str = "gpt-5"
    OPENAI_MODEL_EMBEDDING: str = "text-embedding-3-large"

    OPENAI_MODEL_CLASSIFIER_FALLBACK: str = "gpt-4o-mini"
    OPENAI_MODEL_EXTRACTOR_FALLBACK: str = "gpt-4o"
    OPENAI_MODEL_VALIDATOR_FALLBACK: str = "gpt-4o"
    OPENAI_MODEL_NARRATIVE_FALLBACK: str = "gpt-4o"
    OPENAI_MODEL_EMBEDDING_FALLBACK: str = "text-embedding-3-small"

    # Per-request wall-clock timeout for every OpenAI call.
    EXTRACTION_TIMEOUT_SECONDS: int = 120

    # ------------------------------------------------------------------
    # Backend
    # ------------------------------------------------------------------
    BACKEND_URL: str = "http://localhost:4000"
    BACKEND_CALLBACK_SECRET: str = "change-me"

    # ------------------------------------------------------------------
    # Object storage (S3 / MinIO)
    # ------------------------------------------------------------------
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "us-east-1"

    # ------------------------------------------------------------------
    # Vector store
    # ------------------------------------------------------------------
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str = ""

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""

    # ------------------------------------------------------------------
    # Queue
    # ------------------------------------------------------------------
    REDIS_URL: str = "redis://localhost:6379"

    # ------------------------------------------------------------------
    # OCR backends
    # ------------------------------------------------------------------
    AWS_REGION: str = "us-east-1"
    USE_TEXTRACT: bool = False
    USE_AZURE_DOC_INTEL: bool = False

    # ------------------------------------------------------------------
    # Embeddings (kept for backward-compat with rag/embedder.py)
    # ------------------------------------------------------------------
    EMBEDDING_MODEL_PRIMARY: str = "text-embedding-3-large"
    EMBEDDING_MODEL_FALLBACK: str = "BAAI/bge-large-en-v1.5"

    # ------------------------------------------------------------------
    # Confidence thresholds
    # ------------------------------------------------------------------
    CONFIDENCE_REVIEW_THRESHOLD: float = 0.65
    CONFIDENCE_HIGH_THRESHOLD: float = 0.85

    # ------------------------------------------------------------------
    # Per-task model routing.
    # Values are plain OpenAI model strings (e.g. "gpt-5", "gpt-4o").
    # The router consults this dict via `model_router_config[task.value]`.
    # `primary` / `fallback` are model names; the other keys are call params.
    # ------------------------------------------------------------------
    @property
    def model_router_config(self) -> dict[str, dict[str, Any]]:
        return {
            TaskType.CLASSIFY.value: {
                "primary": self.OPENAI_MODEL_CLASSIFIER,
                "fallback": self.OPENAI_MODEL_CLASSIFIER_FALLBACK,
                "temperature": 0.0,
                "max_tokens": 200,
                "max_retries": 3,
            },
            TaskType.EXTRACT_ENTITY.value: {
                "primary": self.OPENAI_MODEL_EXTRACTOR,
                "fallback": self.OPENAI_MODEL_EXTRACTOR_FALLBACK,
                "temperature": 0.0,
                "max_tokens": 2000,
                "max_retries": 3,
            },
            TaskType.VALIDATE_FIELD.value: {
                "primary": self.OPENAI_MODEL_VALIDATOR,
                "fallback": self.OPENAI_MODEL_VALIDATOR_FALLBACK,
                "temperature": 0.0,
                "max_tokens": 1500,
                "max_retries": 3,
            },
            TaskType.EMBED.value: {
                "primary": self.OPENAI_MODEL_EMBEDDING,
                "fallback": self.OPENAI_MODEL_EMBEDDING_FALLBACK,
                "dimensions": 1536,
                "max_retries": 3,
            },
            TaskType.WRITE_NARRATIVE.value: {
                "primary": self.OPENAI_MODEL_NARRATIVE,
                "fallback": self.OPENAI_MODEL_NARRATIVE_FALLBACK,
                "temperature": 0.3,
                "max_tokens": 3000,
                "max_retries": 2,
            },
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cache settings — read env once per process."""
    return Settings()
