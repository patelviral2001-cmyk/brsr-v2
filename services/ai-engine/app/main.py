"""FastAPI application entry point.

Wires up:
  * structlog
  * OpenTelemetry instrumentation
  * Langfuse callback handler (registered globally for LangChain)
  * CORS (locked-down — comma-separated list from CORS_ALLOW_ORIGINS)
  * Lifespan: open Redis + Qdrant clients
  * Routers (extract, validate, feedback)
  * ``/health`` endpoint — liveness + readiness checks (Redis, Qdrant,
    OpenAI key); optional remote OpenAI ping on ``/ready``.
  * Global exception handler so no stack trace ever leaks to clients.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.utils.logging import configure_logging, get_logger, hash_tenant, redact_pii

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logger.info("startup", env=settings.ENV, service=settings.SERVICE_NAME, port=settings.PORT)

    # Register Langfuse handler globally with LangChain if creds set.
    if settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
        try:
            from langfuse.callback import CallbackHandler  # type: ignore[import-not-found]

            handler = CallbackHandler(
                public_key=settings.LANGFUSE_PUBLIC_KEY,
                secret_key=settings.LANGFUSE_SECRET_KEY,
                host=settings.LANGFUSE_HOST,
            )
            app.state.langfuse_handler = handler
            logger.info("langfuse.registered")
        except Exception as e:  # pragma: no cover
            logger.warning("langfuse.init_failed", err=str(e))
            app.state.langfuse_handler = None
    else:
        app.state.langfuse_handler = None

    # Open Redis client.
    try:
        from redis.asyncio import Redis

        app.state.redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception as e:  # pragma: no cover
        logger.warning("redis.init_failed", err=str(e))
        app.state.redis = None

    # Open Qdrant client.
    try:
        from qdrant_client import AsyncQdrantClient

        app.state.qdrant = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY or None,
        )
    except Exception as e:  # pragma: no cover
        logger.warning("qdrant.init_failed", err=str(e))
        app.state.qdrant = None

    yield

    # Cleanup.
    if app.state.redis is not None:
        try:
            await app.state.redis.aclose()
        except Exception:  # pragma: no cover
            pass
    if app.state.qdrant is not None:
        try:
            await app.state.qdrant.close()
        except Exception:  # pragma: no cover
            pass


def _parse_origins(raw: str) -> list[str]:
    """Comma-separated origins; ``*`` allowed in dev only."""
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    return parts or ["*"]


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="BRSR AI Engine",
        version="2.0.0",
        description="AI extraction engine for BRSR v2.",
        lifespan=lifespan,
    )

    origins = _parse_origins(settings.CORS_ALLOW_ORIGINS)
    # Production refuses wildcard + credentials simultaneously — fail loud
    # if a deployment misconfigures it.
    if settings.ENV != "dev" and "*" in origins:
        logger.warning(
            "cors.wildcard_in_non_dev",
            env=settings.ENV,
            note="CORS_ALLOW_ORIGINS contains '*' outside dev — locking down",
        )
        # In non-dev we refuse the wildcard entirely.
        origins = [o for o in origins if o != "*"] or ["https://invalid.local"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=settings.ENV == "dev",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-AI-Engine-Version"],
    )

    # OpenTelemetry instrumentation.
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)
    except Exception as e:  # pragma: no cover
        logger.warning("otel.init_failed", err=str(e))

    # ------------------------------------------------------------------
    # Global exception handler — guarantees no stack trace leaks out of
    # FastAPI. Returns a generic 500 with a correlation id so on-call can
    # find the failure in logs.
    # ------------------------------------------------------------------
    @app.exception_handler(Exception)
    async def _unhandled(_req: Request, exc: Exception) -> JSONResponse:  # noqa: ARG001
        import uuid

        cid = uuid.uuid4().hex[:12]
        logger.exception(
            "request.unhandled",
            correlation_id=cid,
            err=redact_pii(str(exc)),
        )
        return JSONResponse(
            {"error": "internal_error", "correlation_id": cid},
            status_code=500,
        )

    # Routers.
    from app.router import extract as extract_router
    from app.router import feedback as feedback_router
    from app.router import validate as validate_router

    app.include_router(extract_router.router)
    app.include_router(validate_router.router)
    app.include_router(feedback_router.router)

    @app.get("/health")
    async def health() -> JSONResponse:
        """Liveness — pings Qdrant + Redis and verifies OPENAI_API_KEY is set.

        Does NOT hit OpenAI's network endpoints (that's the ``/ready`` job)
        so this stays fast enough for k8s liveness probes.
        """
        checks: dict[str, Any] = {"service": settings.SERVICE_NAME, "ok": True}

        # Redis
        try:
            if app.state.redis is not None:
                await asyncio.wait_for(app.state.redis.ping(), timeout=1.5)
                checks["redis"] = "ok"
            else:
                checks["redis"] = "uninitialised"
        except Exception as e:
            checks["redis"] = f"err: {redact_pii(str(e))}"
            checks["ok"] = False

        # Qdrant
        try:
            if app.state.qdrant is not None:
                await asyncio.wait_for(app.state.qdrant.get_collections(), timeout=2.0)
                checks["qdrant"] = "ok"
            else:
                checks["qdrant"] = "uninitialised"
        except Exception as e:
            checks["qdrant"] = f"err: {redact_pii(str(e))}"
            checks["ok"] = False

        # OpenAI — config-only check. We just confirm a key is set and that
        # the AsyncOpenAI client can be constructed. Network calls live on
        # the /ready endpoint to keep this probe cheap.
        if not settings.OPENAI_API_KEY:
            checks["openai"] = "missing_key"
            checks["ok"] = False
        else:
            try:
                from openai import AsyncOpenAI

                _ = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                checks["openai"] = "ok"
                checks["openai_model_extractor"] = settings.OPENAI_MODEL_EXTRACTOR
                checks["openai_model_classifier"] = settings.OPENAI_MODEL_CLASSIFIER
            except Exception as e:
                checks["openai"] = f"err: {redact_pii(str(e))}"
                checks["ok"] = False

        status = 200 if checks["ok"] else 503
        return JSONResponse(checks, status_code=status)

    @app.get("/ready")
    async def ready() -> JSONResponse:
        """Readiness — also pings OpenAI's ``/models`` endpoint.

        Confirms the configured key actually works against the upstream so
        a freshly-rotated or revoked key is caught by the orchestrator
        before traffic hits ``/extract``.
        """
        checks: dict[str, Any] = {"service": settings.SERVICE_NAME, "ok": True}
        if not settings.OPENAI_API_KEY:
            checks["openai"] = "missing_key"
            checks["ok"] = False
            return JSONResponse(checks, status_code=503)
        try:
            from openai import AsyncOpenAI

            client_kwargs: dict[str, Any] = {
                "api_key": settings.OPENAI_API_KEY,
                "timeout": 5.0,
                "max_retries": 0,
            }
            if settings.OPENAI_BASE_URL:
                client_kwargs["base_url"] = settings.OPENAI_BASE_URL
            if settings.OPENAI_ORG_ID:
                client_kwargs["organization"] = settings.OPENAI_ORG_ID
            if settings.OPENAI_PROJECT_ID:
                client_kwargs["project"] = settings.OPENAI_PROJECT_ID
            client = AsyncOpenAI(**client_kwargs)
            # ``models.list`` is a cheap auth-checking call.
            page = await asyncio.wait_for(client.models.list(), timeout=5.0)
            count = 0
            try:
                count = sum(1 for _ in page.data)
            except Exception:  # pragma: no cover
                count = -1
            checks["openai"] = "ok"
            checks["openai_models_visible"] = count
        except Exception as e:
            checks["openai"] = f"err: {redact_pii(str(e))}"
            checks["ok"] = False
        status = 200 if checks["ok"] else 503
        return JSONResponse(checks, status_code=status)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"service": "ai-engine", "version": "2.0.0"}

    return app


app = create_app()
