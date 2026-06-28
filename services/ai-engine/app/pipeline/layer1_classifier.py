"""Layer 1 — Document Classification.

Thin wrapper around :class:`app.agents.document_classifier.DocumentClassifier`
that exposes a layer-style ``classify`` method returning a
``Layer1Result`` ready to be consumed by downstream layers.

The underlying classifier already does the heavy lifting (LLM call, JSON
schema validation, taxonomy enforcement). We add:

  * a deterministic offline path used when ``OPENAI_API_KEY`` is not
    configured (so the benchmark runner works without network access);
  * a small filename / preview heuristic that biases the deterministic
    path toward the right DocType for ESG documents.

Public surface:

    layer = Layer1Classifier()
    result = await layer.classify(filename="bill.pdf", text_preview=text,
                                  tenant_id="t", hint=None)
    result.doc_type, result.confidence, result.alternative_types
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from app.agents.document_classifier import DocumentClassifier
from app.config import get_settings
from app.models.internal import ClassificationResult, DocTypeAlternative, DocTypeEnum
from app.utils.logging import get_logger

logger = get_logger("pipeline.layer1")


# ---------------------------------------------------------------------------
# Result shape
# ---------------------------------------------------------------------------


@dataclass
class Layer1Result:
    """Output of layer 1."""

    doc_type: str
    confidence: float
    alternative_types: list[DocTypeAlternative] = field(default_factory=list)
    rationale: Optional[str] = None
    source: str = "llm"  # "llm" / "heuristic" / "hint"

    def to_classification_result(self) -> ClassificationResult:
        return ClassificationResult(
            doc_type=self.doc_type,
            confidence=self.confidence,
            alternative_types=self.alternative_types,
            rationale=self.rationale,
        )


# ---------------------------------------------------------------------------
# Heuristic patterns — these run when no LLM is available, and also augment
# the LLM result with a confidence floor when the heuristic is very confident.
# ---------------------------------------------------------------------------


_HEURISTIC_PATTERNS: list[tuple[str, list[re.Pattern]]] = [
    (
        DocTypeEnum.UTILITY_BILL.value,
        [
            re.compile(r"\b(units?\s+consumed|kwh\s+consumed|tariff|sanctioned\s+load|fixed\s+charge)\b", re.I),
            re.compile(r"\b(electricity\s+bill|energy\s+bill|power\s+bill)\b", re.I),
            re.compile(r"\b(tata\s+power|adani\s+electricity|mgvcl|torrent\s+power|bses|cesc)\b", re.I),
        ],
    ),
    (
        DocTypeEnum.FUEL_INVOICE.value,
        [
            re.compile(r"\b(diesel|hsd|petrol|gasoline|fuel\s+invoice|nozzle|dispensing\s+unit)\b", re.I),
            re.compile(r"\b(indian\s+oil|hpcl|bpcl|reliance\s+petroleum)\b", re.I),
        ],
    ),
    (
        DocTypeEnum.WATER_BILL.value,
        [
            re.compile(r"\b(water\s+bill|water\s+supply|water\s+consumption|borewell|municipal\s+water)\b", re.I),
            re.compile(r"\b(kilolit(?:re|er)s?|kl\s+consumed|cubic\s+met(?:re|er)s?)\b", re.I),
        ],
    ),
    (
        DocTypeEnum.HR_HEADCOUNT_SHEET.value,
        [
            re.compile(r"\bemployee\s+(?:id|code|name|master)\b", re.I),
            re.compile(r"\b(?:headcount|workforce|gender|date\s+of\s+joining)\b", re.I),
            re.compile(r"\b(?:training\s+report|training\s+hours)\b", re.I),
        ],
    ),
    (
        DocTypeEnum.WASTE_MANIFEST.value,
        [
            re.compile(r"\b(hazardous\s+waste|waste\s+manifest|form\s+10|tsdf|cpcb)\b", re.I),
            re.compile(r"\b(co[\-\s]processing|landfill|incineration|e[\-\s]waste)\b", re.I),
        ],
    ),
]


def _heuristic_classify(filename: str, text_preview: str) -> tuple[str, float, str]:
    """Return (doc_type, confidence, rationale)."""
    haystack = f"{filename or ''}\n{(text_preview or '')[:4000]}"
    scores: dict[str, int] = {}
    for doc_type, patterns in _HEURISTIC_PATTERNS:
        for pat in patterns:
            if pat.search(haystack):
                scores[doc_type] = scores.get(doc_type, 0) + 1
    if not scores:
        return DocTypeEnum.UNKNOWN.value, 0.0, "no heuristic matched"
    best = max(scores.items(), key=lambda kv: kv[1])
    doc_type, count = best
    # 1 hit => 0.55, 2 => 0.78, 3+ => 0.92
    confidence = min(0.95, 0.40 + 0.18 * count)
    return doc_type, confidence, f"heuristic match ({count} pattern(s))"


# ---------------------------------------------------------------------------
# Layer
# ---------------------------------------------------------------------------


class Layer1Classifier:
    """Layer 1 — produces a ``DocType`` + confidence for the document."""

    def __init__(self, classifier: Optional[DocumentClassifier] = None) -> None:
        self.s = get_settings()
        # Lazy-construct so unit tests can supply a stub.
        self._llm_classifier = classifier

    # ------------------------------------------------------------------
    async def classify(
        self,
        *,
        filename: str,
        text_preview: str,
        tenant_id: str,
        hint: Optional[str] = None,
    ) -> Layer1Result:
        # 1) Honour an explicit hint with high confidence if it is in taxonomy.
        if hint:
            normalized = hint.upper()
            if normalized in {e.value for e in DocTypeEnum}:
                logger.debug("layer1.hint", hint=normalized)
                return Layer1Result(
                    doc_type=normalized,
                    confidence=0.99,
                    rationale="explicit uploader hint",
                    source="hint",
                )

        # 2) Try the LLM classifier if an API key is configured.
        if self.s.OPENAI_API_KEY:
            if self._llm_classifier is None:
                self._llm_classifier = DocumentClassifier()
            try:
                res: ClassificationResult = await self._llm_classifier.classify(
                    filename=filename,
                    text_preview=text_preview,
                    tenant_id=tenant_id,
                    hint=hint,
                )
                if res.doc_type and res.doc_type != DocTypeEnum.UNKNOWN.value:
                    return Layer1Result(
                        doc_type=res.doc_type,
                        confidence=res.confidence,
                        alternative_types=list(res.alternative_types),
                        rationale=res.rationale,
                        source="llm",
                    )
            except Exception as e:  # noqa: BLE001 — fall back to heuristic
                logger.warning("layer1.llm_failed", err=str(e))

        # 3) Deterministic heuristic fallback (offline-safe).
        doc_type, conf, rationale = _heuristic_classify(filename, text_preview)
        return Layer1Result(
            doc_type=doc_type,
            confidence=conf,
            rationale=rationale,
            source="heuristic",
        )
