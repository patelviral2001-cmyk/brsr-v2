"""Shared pytest fixtures."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(autouse=True)
def _set_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("BACKEND_URL", "http://test-backend")
    monkeypatch.setenv("BACKEND_INTERNAL_TOKEN", "test-token")
    # Reset settings cache so the new env is picked up.
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def principal():
    from app.auth import Principal

    return Principal(
        tenant_id="t_test",
        user_id="u_test",
        roles=("admin",),
        scopes=("read",),
        raw={},
    )
