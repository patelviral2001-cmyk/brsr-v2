"""
HTTP client for the BRSR-v2 backend.

We keep a single AsyncClient per process (init at startup, reuse for connection
pooling). All calls authenticate with the internal service token + propagate
the tenant ID as a header so the backend can scope its database queries.
"""
from __future__ import annotations

from typing import Any

import httpx
import structlog
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.config import Settings

log = structlog.get_logger("copilot.tools.backend")

_CLIENT: httpx.AsyncClient | None = None
_BASE_URL: str | None = None
_TOKEN: str | None = None


async def init_backend_client(settings: Settings) -> None:
    global _CLIENT, _BASE_URL, _TOKEN
    _BASE_URL = str(settings.backend_url).rstrip("/")
    _TOKEN = settings.backend_internal_token
    _CLIENT = httpx.AsyncClient(
        base_url=_BASE_URL,
        timeout=httpx.Timeout(connect=5.0, read=settings.request_timeout_seconds, write=10.0, pool=5.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )


async def close_backend_client() -> None:
    global _CLIENT
    if _CLIENT is not None:
        await _CLIENT.aclose()
        _CLIENT = None


def _client() -> httpx.AsyncClient:
    if _CLIENT is None:
        raise RuntimeError("backend client not initialised")
    return _CLIENT


def _headers(tenant_id: str, user_id: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {_TOKEN or ''}",
        "X-Tenant-Id": tenant_id,
        "X-Service": "copilot",
    }
    if user_id:
        headers["X-User-Id"] = user_id
    return headers


async def backend_ready() -> bool:
    try:
        r = await _client().get("/health", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False


async def _request(method: str, path: str, *, tenant_id: str, user_id: str | None = None, **kwargs: Any) -> Any:
    """Retry transient errors with exponential backoff and jitter."""
    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential_jitter(initial=0.25, max=2.0),
            retry=retry_if_exception_type(
                (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError)
            ),
            reraise=True,
        ):
            with attempt:
                r = await _client().request(
                    method, path, headers=_headers(tenant_id, user_id), **kwargs
                )
                if r.status_code >= 500:
                    r.raise_for_status()
                return r
    except RetryError as e:
        raise RuntimeError(f"backend {method} {path} failed after retries") from e


async def get_metric_series(
    *,
    tenant_id: str,
    user_id: str | None,
    canonical_key: str,
    period: str,
    scope_node_id: str | None = None,
) -> dict[str, Any]:
    params = {"canonical_key": canonical_key, "period": period}
    if scope_node_id:
        params["scope_node_id"] = scope_node_id
    r = await _request("GET", "/v1/metrics/series", tenant_id=tenant_id, user_id=user_id, params=params)
    if r.status_code == 404:
        return {"canonical_key": canonical_key, "period": period, "value": None, "found": False}
    r.raise_for_status()
    return r.json()


async def get_calc_run(*, tenant_id: str, user_id: str | None, run_id: str) -> dict[str, Any]:
    r = await _request("GET", f"/v1/calc-runs/{run_id}", tenant_id=tenant_id, user_id=user_id)
    r.raise_for_status()
    return r.json()


async def get_framework_completion(
    *, tenant_id: str, user_id: str | None, framework: str, fiscal_year: str
) -> dict[str, Any]:
    params = {"framework": framework, "fy": fiscal_year}
    r = await _request(
        "GET", "/v1/framework-progress", tenant_id=tenant_id, user_id=user_id, params=params
    )
    r.raise_for_status()
    return r.json()


async def get_assurance_walkthrough(
    *, tenant_id: str, user_id: str | None, snapshot_id: str, metric_key: str
) -> dict[str, Any]:
    r = await _request(
        "GET",
        f"/v1/assurance/snapshots/{snapshot_id}/walkthrough/{metric_key}",
        tenant_id=tenant_id,
        user_id=user_id,
    )
    r.raise_for_status()
    return r.json()


async def list_recent_changes(
    *, tenant_id: str, user_id: str | None, entity_type: str, days: int
) -> dict[str, Any]:
    params = {"entity_type": entity_type, "days": days}
    r = await _request(
        "GET", "/v1/changes/recent", tenant_id=tenant_id, user_id=user_id, params=params
    )
    r.raise_for_status()
    return r.json()
