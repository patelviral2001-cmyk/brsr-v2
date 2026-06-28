"""
Copilot FastAPI entrypoint.

This is a separate service from the main API; it talks to the backend over HTTP
and is deployed independently so it can scale on LLM workload patterns.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.observability import configure_logging, configure_tracing
from app.rag.vector_store import close_vector_store, init_vector_store
from app.router import chat as chat_router
from app.router import embed as embed_router
from app.tools.backend_client import close_backend_client, init_backend_client

log = structlog.get_logger("copilot.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Wire up shared resources at startup and tear them down on shutdown."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.env)
    configure_tracing(settings)
    await init_backend_client(settings)
    await init_vector_store(settings)
    log.info("copilot.startup", env=settings.env, port=settings.port)
    try:
        yield
    finally:
        await close_backend_client()
        await close_vector_store()
        log.info("copilot.shutdown")


app = FastAPI(
    title="BRSR-v2 ESG Copilot",
    description=(
        "AI assistant for ESG reporting. Streams via SSE; every numeric "
        "claim is backed by a tool call against the warehouse."
    ),
    version="0.1.0",
    lifespan=lifespan,
    default_response_class=JSONResponse,
)


# ---------------------------------------------------------------------------
# CORS — locked to the BRSR-v2 frontend origins.
# ---------------------------------------------------------------------------
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Tenant-Id", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
    max_age=600,
)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(chat_router.router, prefix="/chat", tags=["chat"])
app.include_router(embed_router.router, prefix="/embed", tags=["embed"])


# ---------------------------------------------------------------------------
# Health + readiness
# ---------------------------------------------------------------------------
@app.get("/health", include_in_schema=False)
async def health() -> dict:
    """Liveness probe — always 200 once the loop is up."""
    return {"status": "ok"}


@app.get("/ready", include_in_schema=False)
async def ready() -> dict:
    """Readiness probe — verifies vector store and backend client are reachable."""
    from app.rag.vector_store import vector_store_ready
    from app.tools.backend_client import backend_ready

    backend_ok, vector_ok = await asyncio.gather(backend_ready(), vector_store_ready())
    overall = backend_ok and vector_ok
    payload = {
        "status": "ok" if overall else "degraded",
        "backend": backend_ok,
        "vector_store": vector_ok,
    }
    return JSONResponse(payload, status_code=200 if overall else 503)


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    log.warning(
        "http_exception",
        path=str(request.url.path),
        status=exc.status_code,
        detail=exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "message": exc.detail}},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Don't leak stack traces to the client.
    log.exception("unhandled_exception", path=str(request.url.path))
    return JSONResponse(
        status_code=500,
        content={"error": {"code": 500, "message": "Internal server error"}},
    )


if __name__ == "__main__":
    # For local dev only. In containers, uvicorn is the entrypoint.
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        log_level=logging.getLevelName(settings.log_level.upper()).lower()
        if isinstance(settings.log_level, str)
        else "info",
        reload=settings.env == "development",
    )
