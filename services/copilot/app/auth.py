"""
JWT extraction utilities.

The backend issues short-lived RS256 JWTs that include the tenant_id, user_id,
roles, and scope of the current session. We verify the signature against the
public key (loaded from disk at startup) and surface a Pydantic principal.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


@dataclass(frozen=True, slots=True)
class Principal:
    tenant_id: str
    user_id: str
    roles: tuple[str, ...]
    scopes: tuple[str, ...]
    raw: dict[str, Any]


_PUBLIC_KEY_CACHE: str | None = None


def _load_public_key(settings: Settings) -> str:
    global _PUBLIC_KEY_CACHE
    if _PUBLIC_KEY_CACHE is not None:
        return _PUBLIC_KEY_CACHE
    path = settings.jwt_public_key_pem_path
    if not path:
        # In dev we accept HS256 with a shared dummy key — guarded behind env.
        if settings.env == "development":
            _PUBLIC_KEY_CACHE = "dev-only-key"
            return _PUBLIC_KEY_CACHE
        raise RuntimeError("JWT_PUBLIC_KEY_PEM_PATH not configured")
    pem = Path(path).read_text(encoding="utf-8")
    _PUBLIC_KEY_CACHE = pem
    return pem


def _decode(token: str, settings: Settings) -> dict[str, Any]:
    key = _load_public_key(settings)
    algorithm = settings.jwt_algorithm if settings.env != "development" else "HS256"
    return jwt.decode(
        token,
        key=key,
        algorithms=[algorithm],
        issuer=settings.jwt_issuer,
        options={"require": ["exp", "iss", "sub"]},
    )


def require_principal(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = _decode(token, settings)
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(401, "Token expired") from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, f"Invalid token: {e}") from e

    tenant_id = claims.get("tenant_id") or claims.get("tid")
    user_id = claims.get("sub")
    if not tenant_id or not user_id:
        raise HTTPException(401, "Token missing tenant_id or sub")

    return Principal(
        tenant_id=str(tenant_id),
        user_id=str(user_id),
        roles=tuple(claims.get("roles", []) or []),
        scopes=tuple(claims.get("scope", "").split() if isinstance(claims.get("scope"), str) else []),
        raw=claims,
    )
