"""
Prompt registry.

We keep prompts in markdown files alongside this module so they can be reviewed,
versioned and A/B-tested without changing Python code. Prompts are cached in
memory after first read.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_PROMPT_DIR = Path(__file__).parent


@lru_cache(maxsize=64)
def load_prompt(name: str) -> str:
    path = _PROMPT_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(
            f"Prompt '{name}' not found at {path}. "
            f"Add a markdown file or fix the name."
        )
    return path.read_text(encoding="utf-8").strip()


def reload_prompts() -> None:
    """Clear the cache. Useful in tests."""
    load_prompt.cache_clear()
