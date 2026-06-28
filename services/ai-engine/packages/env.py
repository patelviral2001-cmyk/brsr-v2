"""Zero-dependency .env loader. Loads C:\\Users\\admin\\uedi\\.env into os.environ
without overriding already-set process env. Secrets stay out of code/VCS."""
from __future__ import annotations

import os
from pathlib import Path


def load_env(path: str | None = None) -> None:
    p = Path(path) if path else Path(__file__).resolve().parents[1] / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and key not in os.environ:
            os.environ[key] = val
