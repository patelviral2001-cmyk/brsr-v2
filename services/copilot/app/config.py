"""
Typed runtime configuration. All values come from environment variables.

Use `from app.config import get_settings; settings = get_settings()` everywhere
— it returns a cached singleton so we don't re-parse env on every request.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List, Literal

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- HTTP
    host: str = "0.0.0.0"
    port: int = 8101
    log_level: Literal["debug", "info", "warning", "error"] = "info"
    env: Literal["development", "staging", "production", "test"] = "development"
    cors_origins: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
        ]
    )

    # ---- LLM providers
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    anthropic_primary_model: str = "claude-3-5-sonnet-20241022"
    anthropic_fast_model: str = "claude-3-5-haiku-20241022"
    openai_embedding_model: str = "text-embedding-3-large"

    # ---- Internal services
    backend_url: AnyHttpUrl = "http://localhost:4000"  # type: ignore[assignment]
    backend_internal_token: str = ""

    # ---- Vector store / cache
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    redis_url: str = "redis://localhost:6379/2"

    # ---- Observability
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # ---- Auth
    jwt_public_key_pem_path: str = ""
    jwt_algorithm: str = "RS256"
    jwt_issuer: str = "brsr-v2-api"

    # ---- Limits
    max_tokens_per_response: int = 4096
    max_tool_calls_per_turn: int = 12
    request_timeout_seconds: int = 120

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, v: str | List[str] | None) -> List[str]:
        if v is None or v == "":
            return [
                "http://localhost:3000",
                "http://localhost:5173",
            ]
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
