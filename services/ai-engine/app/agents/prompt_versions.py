"""Prompt versions — single source of truth.

Each constant holds (version_name, content). The content is loaded from a
companion .md file under app/llm/prompts/ at import time so prompts can be
edited as Markdown but referenced as Python constants.

When a prompt is used by an LLM call, the version_name is passed as
`prompt_version` so Langfuse can group traces and detect regressions.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

_PROMPT_DIR = Path(__file__).parent.parent / "llm" / "prompts"


@dataclass(frozen=True)
class PromptVersion:
    name: str
    file: str

    @property
    def content(self) -> str:
        path = _PROMPT_DIR / self.file
        return path.read_text(encoding="utf-8")


CLASSIFIER_V3 = PromptVersion("classifier_v3", "classifier_v3.md")
ENTITY_EXTRACTION_V5 = PromptVersion("entity_extraction_v5", "entity_extraction_v5.md")
CHUNK_CLASSIFIER_V2 = PromptVersion("chunk_classifier_v2", "chunk_classifier_v2.md")
VALIDATOR_V2 = PromptVersion("validator_v2", "validator_v2.md")
SHEET_CLASSIFIER_V1 = PromptVersion("sheet_classifier_v1", "sheet_classifier_v1.md")


ALL_PROMPTS = {
    p.name: p
    for p in (
        CLASSIFIER_V3,
        ENTITY_EXTRACTION_V5,
        CHUNK_CLASSIFIER_V2,
        VALIDATOR_V2,
        SHEET_CLASSIFIER_V1,
    )
}
