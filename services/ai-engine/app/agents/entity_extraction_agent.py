"""Entity extraction agent — LangGraph state machine.

Nodes:
  1. chunk_classifier — for each chunk, predict candidate metric keys (cheap LLM).
  2. per_metric_extractor — for each (chunk, predicted_key) pair, call the
     extractor model (GPT-5) with a constrained ``response_format`` so the
     output is guaranteed to be a JSON object with the expected shape.
  3. aggregator — merge fields, deduplicate, normalize units to canonical.
  4. validator — cross-field sanity (female ≤ total, recycled ≤ generated, etc).

Implemented via LangGraph's ``StateGraph`` with typed state. We deliberately
avoid LangChain's chains here — direct OpenAI calls via ``LLMRouter`` keep
the stack thin and the state graph wiring intact.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Optional, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.prompt_versions import CHUNK_CLASSIFIER_V2, ENTITY_EXTRACTION_V5
from app.config import TaskType
from app.llm.openai_helper import json_schema_to_response_format
from app.llm.router import LLMError, get_router
from app.models.internal import DocumentChunk, RawField
from app.models.responses import (
    BoundingBox,
    ConfidenceComponents,
    ConfidenceLevel,
    ExtractedField,
)
from app.registry import METRIC_REGISTRY, get_metric
from app.utils.logging import get_logger
from app.utils.units import canonical_unit, convert, parse_numeric

logger = get_logger("agents.entity")


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class AgentState(TypedDict, total=False):
    tenant_id: str
    file_id: str
    doc_type: str
    reporting_period_hint: Optional[str]
    chunks: list[DocumentChunk]
    candidate_keys: list[str]
    chunk_predictions: dict[str, list[str]]  # chunk_id -> [metric_keys]
    raw_fields: list[RawField]
    extracted_fields: list[ExtractedField]
    issues: list[dict[str, Any]]
    model_calls: int
    total_tokens: int


# ---------------------------------------------------------------------------
# Schemas (passed as tool-call response shapes)
# ---------------------------------------------------------------------------


CHUNK_PREDICTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "predicted_keys": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 20,
        },
        "rationale": {"type": "string", "maxLength": 200},
    },
    "required": ["predicted_keys"],
}


CHUNK_PREDICTION_RESPONSE_FORMAT = json_schema_to_response_format(
    CHUNK_PREDICTION_SCHEMA,
    name="ChunkPrediction",
    strict=False,
)


def _entity_schema_for(metric_def: dict[str, Any]) -> dict[str, Any]:
    constraints = metric_def.get("value_constraints", {})
    dtype = constraints.get("dtype", "float")
    value_props: dict[str, Any] = {
        "type": "number" if dtype != "int" else "integer",
    }
    if "min" in constraints:
        value_props["minimum"] = constraints["min"]
    if "max" in constraints:
        value_props["maximum"] = constraints["max"]
    return {
        "type": "object",
        "properties": {
            "values": {
                "type": "array",
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "properties": {
                        "value_text": {"type": "string"},
                        "value_num": value_props,
                        "unit": {"type": "string"},
                        "period_text": {"type": "string"},
                        "source_excerpt": {"type": "string", "maxLength": 400},
                        "source_cell": {"type": "string"},
                        "dimensions": {"type": "object"},
                        "model_logprob": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "notes": {"type": "string"},
                    },
                    "required": ["value_text"],
                },
            }
        },
        "required": ["values"],
    }


# ---------------------------------------------------------------------------
# Doc-type to candidate-metric filtering
# ---------------------------------------------------------------------------


DOC_TYPE_TO_CATEGORIES: dict[str, list[str]] = {
    "UTILITY_BILL": ["energy"],
    "FUEL_INVOICE": ["energy"],
    "WATER_BILL": ["water"],
    "WASTE_MANIFEST": ["waste"],
    "HR_PAYROLL": ["workforce"],
    "HR_HEADCOUNT_SHEET": ["workforce"],
    "EHS_INCIDENT_REPORT": ["health_safety"],
    "AUDITED_FINANCIALS": ["financial", "governance"],
    "BOARD_MINUTES": ["governance"],
    "CSR_SPEND_REPORT": ["community"],
    "ENERGY_AUDIT": ["energy", "ghg"],
    "RENEWABLE_PPA": ["energy"],
    "FUGITIVE_LOG": ["ghg"],
    "SUPPLIER_SAQ": ["governance", "workforce"],
    "GENERIC": ["energy", "water", "waste", "ghg", "workforce", "governance", "community"],
    "UNKNOWN": ["energy", "water", "waste", "ghg", "workforce", "governance", "community"],
}


def candidate_keys_for_doc_type(doc_type: str) -> list[str]:
    cats = DOC_TYPE_TO_CATEGORIES.get(doc_type, DOC_TYPE_TO_CATEGORIES["GENERIC"])
    return [k for k, v in METRIC_REGISTRY.items() if v.get("category") in cats]


# ---------------------------------------------------------------------------
# Node implementations
# ---------------------------------------------------------------------------


class EntityExtractionAgent:
    def __init__(self) -> None:
        self.router = get_router()
        self._graph = self._build_graph()

    # -- public entrypoint
    async def run(
        self,
        *,
        tenant_id: str,
        file_id: str,
        doc_type: str,
        chunks: list[DocumentChunk],
        prior_raw_fields: list[RawField] | None = None,
        reporting_period_hint: str | None = None,
    ) -> tuple[list[ExtractedField], list[dict[str, Any]], int]:
        state: AgentState = {
            "tenant_id": tenant_id,
            "file_id": file_id,
            "doc_type": doc_type,
            "reporting_period_hint": reporting_period_hint,
            "chunks": chunks,
            "candidate_keys": candidate_keys_for_doc_type(doc_type),
            "chunk_predictions": {},
            "raw_fields": list(prior_raw_fields or []),
            "extracted_fields": [],
            "issues": [],
            "model_calls": 0,
            "total_tokens": 0,
        }
        final = await self._graph.ainvoke(state)
        return final["extracted_fields"], final.get("issues", []), final.get("model_calls", 0)

    # -- graph construction
    def _build_graph(self) -> Any:
        g: StateGraph = StateGraph(AgentState)
        g.add_node("chunk_classifier", self.node_chunk_classifier)
        g.add_node("per_metric_extractor", self.node_per_metric_extractor)
        g.add_node("aggregator", self.node_aggregator)
        g.add_node("validator", self.node_validator)

        g.set_entry_point("chunk_classifier")
        g.add_edge("chunk_classifier", "per_metric_extractor")
        g.add_edge("per_metric_extractor", "aggregator")
        g.add_edge("aggregator", "validator")
        g.add_edge("validator", END)
        return g.compile()

    # ------------------------------------------------------------------
    # Node 1 — chunk classifier
    # ------------------------------------------------------------------
    async def node_chunk_classifier(self, state: AgentState) -> AgentState:
        chunks = state.get("chunks", [])
        candidates = state.get("candidate_keys") or list(METRIC_REGISTRY.keys())
        # Trim candidate metadata to keep prompts cheap
        cand_meta = [
            {"canonical_key": k, "name": METRIC_REGISTRY[k]["name"], "aliases": METRIC_REGISTRY[k].get("aliases", [])[:5]}
            for k in candidates
        ]
        # Truncate aggressively per call
        cand_chunks = _batch(cand_meta, 80)

        predictions: dict[str, list[str]] = {}
        calls = state.get("model_calls", 0)

        # Cheap parallel classification — limit concurrency
        sem = asyncio.Semaphore(6)

        async def classify_chunk(chunk: DocumentChunk) -> None:
            nonlocal calls
            text = (chunk.text or "")[:3500]
            if not text.strip() or len(text) < 25:
                predictions[chunk.chunk_id] = []
                return
            collected: set[str] = set()
            for batch in cand_chunks:
                payload = {
                    "chunk_text": text,
                    "candidate_metrics": batch,
                }
                async with sem:
                    try:
                        res = await self.router.chat(
                            task=TaskType.CLASSIFY,
                            messages=[
                                {"role": "system", "content": CHUNK_CLASSIFIER_V2.content},
                                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                            ],
                            prompt_version=CHUNK_CLASSIFIER_V2.name,
                            tenant_id=state.get("tenant_id", ""),
                            response_format=CHUNK_PREDICTION_RESPONSE_FORMAT,
                        )
                        calls += 1
                        keys = [k for k in (res.parsed or {}).get("predicted_keys", []) if k in METRIC_REGISTRY]
                        collected.update(keys)
                    except LLMError as e:
                        logger.warning("chunk_classifier.failed", chunk=chunk.chunk_id, err=str(e))
            predictions[chunk.chunk_id] = sorted(collected)

        await asyncio.gather(*(classify_chunk(c) for c in chunks))

        state["chunk_predictions"] = predictions
        state["model_calls"] = calls
        return state

    # ------------------------------------------------------------------
    # Node 2 — per-metric extractor
    # ------------------------------------------------------------------
    async def node_per_metric_extractor(self, state: AgentState) -> AgentState:
        chunks_by_id = {c.chunk_id: c for c in state.get("chunks", [])}
        predictions = state.get("chunk_predictions", {})
        raw_fields = list(state.get("raw_fields", []))
        calls = state.get("model_calls", 0)
        sem = asyncio.Semaphore(8)

        async def extract_one(chunk_id: str, metric_key: str) -> list[RawField]:
            nonlocal calls
            metric_def = get_metric(metric_key)
            if not metric_def:
                return []
            chunk = chunks_by_id.get(chunk_id)
            if chunk is None:
                return []
            schema = _entity_schema_for(metric_def)
            response_format = json_schema_to_response_format(
                schema,
                name="EntityValues",
                strict=False,
            )
            metric_brief = {
                "canonical_key": metric_key,
                "name": metric_def["name"],
                "unit": metric_def["unit"],
                "allowed_units": metric_def.get("allowed_units", []),
                "value_constraints": metric_def.get("value_constraints", {}),
                "llm_hint": metric_def.get("llm_hint", ""),
                "dimensions": metric_def.get("dimensions", []),
            }
            payload = {
                "chunk": {
                    "chunk_id": chunk.chunk_id,
                    "page": chunk.page,
                    "kind": chunk.kind.value if hasattr(chunk.kind, "value") else str(chunk.kind),
                    "sheet": chunk.sheet,
                    "text": (chunk.text or "")[:6000],
                    "table": chunk.table[:30] if chunk.table else None,
                },
                "metric": metric_brief,
                "reporting_period_hint": state.get("reporting_period_hint"),
            }
            async with sem:
                try:
                    res = await self.router.chat(
                        task=TaskType.EXTRACT_ENTITY,
                        messages=[
                            {"role": "system", "content": ENTITY_EXTRACTION_V5.content},
                            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                        ],
                        prompt_version=ENTITY_EXTRACTION_V5.name,
                        tenant_id=state.get("tenant_id", ""),
                        response_format=response_format,
                        extra_meta={"metric_key": metric_key, "chunk_id": chunk.chunk_id},
                    )
                    calls += 1
                except LLMError as e:
                    logger.warning("entity.extract_failed", metric=metric_key, chunk=chunk.chunk_id, err=str(e))
                    return []

            values = (res.parsed or {}).get("values", []) or []
            out: list[RawField] = []
            for v in values:
                if not isinstance(v, dict):
                    continue
                text_val = v.get("value_text")
                num_val = v.get("value_num")
                if num_val is None and text_val:
                    num_val = parse_numeric(str(text_val))
                rf = RawField(
                    canonical_key=metric_key,
                    raw_label=metric_def["name"],
                    raw_value=str(text_val) if text_val is not None else None,
                    value_num=float(num_val) if isinstance(num_val, (int, float)) else None,
                    unit=v.get("unit"),
                    period_text=v.get("period_text"),
                    chunk_id=chunk.chunk_id,
                    page=chunk.page,
                    bbox=chunk.bbox,
                    sheet=chunk.sheet,
                    row=chunk.row,
                    cell=v.get("source_cell"),
                    dimensions=v.get("dimensions") or {},
                    source="llm",
                    model_used=res.call.model,
                    prompt_version=ENTITY_EXTRACTION_V5.name,
                    model_logprob=float(v.get("model_logprob")) if isinstance(v.get("model_logprob"), (int, float)) else None,
                    notes=v.get("notes"),
                )
                out.append(rf)
            return out

        tasks: list[asyncio.Task[list[RawField]]] = []
        for chunk_id, keys in predictions.items():
            for mk in keys[:25]:  # cap per chunk
                tasks.append(asyncio.create_task(extract_one(chunk_id, mk)))

        for coro in asyncio.as_completed(tasks):
            try:
                raw_fields.extend(await coro)
            except Exception as e:  # noqa: BLE001
                logger.warning("entity.task_failed", err=str(e))

        state["raw_fields"] = raw_fields
        state["model_calls"] = calls
        return state

    # ------------------------------------------------------------------
    # Node 3 — aggregator
    # ------------------------------------------------------------------
    async def node_aggregator(self, state: AgentState) -> AgentState:
        raw_fields = state.get("raw_fields", [])
        # Group: (canonical_key, period_text, dimensions_sig)
        groups: dict[tuple[str, str, str], list[RawField]] = {}
        for rf in raw_fields:
            if not rf.canonical_key:
                continue
            sig = (
                rf.canonical_key,
                rf.period_text or "",
                json.dumps(rf.dimensions or {}, sort_keys=True),
            )
            groups.setdefault(sig, []).append(rf)

        extracted: list[ExtractedField] = []
        for (key, period_text, _), members in groups.items():
            metric = get_metric(key)
            if not metric:
                continue

            # Multi-source agreement: if 2+ different values and they DISAGREE materially,
            # keep top-2 separately with low confidence and needs_review.
            distinct = _distinct_values(members)
            if len(distinct) >= 2 and not _values_agree(distinct):
                for sample_rf in distinct[:2]:
                    extracted.append(_to_field(sample_rf, metric, needs_review=True, low_conf=True))
                continue

            # Otherwise pick the best — highest model_logprob → fallback first occurrence
            best = sorted(
                members,
                key=lambda r: (r.model_logprob or 0.0, -float(_safe_len(r.raw_value or ""))),
                reverse=True,
            )[0]
            extracted.append(_to_field(best, metric))

        state["extracted_fields"] = extracted
        return state

    # ------------------------------------------------------------------
    # Node 4 — validator (cross-field sanity)
    # ------------------------------------------------------------------
    async def node_validator(self, state: AgentState) -> AgentState:
        fields = state.get("extracted_fields", [])
        issues: list[dict[str, Any]] = list(state.get("issues", []))
        index = {(f.canonical_key, f.period_start, f.period_end): f for f in fields}

        def get_val(key: str, period_start: Any, period_end: Any) -> Optional[float]:
            f = index.get((key, period_start, period_end))
            return f.value_canonical if f else None

        for f in fields:
            key = f.canonical_key
            # Female ≤ Total
            if key == "employee_count_female":
                total = get_val("employee_count_total", f.period_start, f.period_end)
                if total is not None and f.value_canonical is not None and f.value_canonical > total:
                    f.issues.append("female_employees_exceeds_total")
                    f.needs_review = True
                    issues.append(
                        {"canonical_key": key, "code": "INCONSISTENT", "message": "Female > Total"}
                    )
            # Male + Female ≤ Total
            if key == "employee_count_male":
                male = f.value_canonical
                female = get_val("employee_count_female", f.period_start, f.period_end)
                total = get_val("employee_count_total", f.period_start, f.period_end)
                if all(v is not None for v in (male, female, total)) and (male + female) > total + 1:  # type: ignore[operator]
                    f.issues.append("male_plus_female_exceeds_total")
                    f.needs_review = True
                    issues.append(
                        {"canonical_key": key, "code": "INCONSISTENT", "message": "Male+Female > Total"}
                    )
            # Water consumed ≈ withdrawn − discharged (± 10%)
            if key == "water_consumed_kl":
                withdrawn = get_val("water_withdrawn_total_kl", f.period_start, f.period_end)
                discharged = get_val("water_discharged_kl", f.period_start, f.period_end)
                if withdrawn is not None and discharged is not None and f.value_canonical is not None:
                    expected = withdrawn - discharged
                    if expected > 0 and abs(f.value_canonical - expected) / expected > 0.1:
                        f.issues.append("water_balance_mismatch")
                        f.needs_review = True
                        issues.append(
                            {
                                "canonical_key": key,
                                "code": "WATER_BALANCE",
                                "message": f"consumed={f.value_canonical}, expected≈{expected}",
                            }
                        )
            # Recycled ≤ total waste
            if key == "waste_recycled_kg":
                haz = get_val("waste_hazardous_kg", f.period_start, f.period_end) or 0
                non = get_val("waste_non_hazardous_kg", f.period_start, f.period_end) or 0
                total_w = haz + non
                if f.value_canonical is not None and total_w > 0 and f.value_canonical > total_w + 1:
                    f.issues.append("recycled_exceeds_generated")
                    f.needs_review = True
                    issues.append(
                        {"canonical_key": key, "code": "WASTE_BALANCE", "message": "Recycled > Generated"}
                    )
            # Independent + Women ≤ board size
            if key == "independent_directors_count":
                board = get_val("board_size", f.period_start, f.period_end)
                if board is not None and f.value_canonical is not None and f.value_canonical > board:
                    f.issues.append("independent_exceeds_board")
                    f.needs_review = True
                    issues.append(
                        {"canonical_key": key, "code": "GOV_BALANCE", "message": "Independent > Board size"}
                    )

        state["issues"] = issues
        return state


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _batch(lst: list[Any], size: int) -> list[list[Any]]:
    return [lst[i : i + size] for i in range(0, len(lst), size)]


def _safe_len(x: Any) -> int:
    try:
        return len(str(x))
    except Exception:
        return 0


def _distinct_values(members: list[RawField]) -> list[RawField]:
    seen: dict[str, RawField] = {}
    for rf in members:
        key = f"{round(rf.value_num, 4) if rf.value_num is not None else rf.raw_value}|{rf.unit or ''}"
        if key not in seen:
            seen[key] = rf
    return list(seen.values())


def _values_agree(distinct: list[RawField], tol: float = 0.02) -> bool:
    nums = [rf.value_num for rf in distinct if rf.value_num is not None]
    if not nums:
        return True
    pivot = nums[0]
    if pivot == 0:
        return all(abs(n) < 1e-9 for n in nums)
    return all(abs(n - pivot) / abs(pivot) <= tol for n in nums)


def _to_field(
    rf: RawField,
    metric_def: dict[str, Any],
    *,
    needs_review: bool = False,
    low_conf: bool = False,
) -> ExtractedField:
    canon_unit = canonical_unit(rf.unit or metric_def.get("unit", ""))
    target_unit = canonical_unit(metric_def.get("unit", "")) or metric_def.get("unit", "")
    value_canonical: Optional[float] = None
    if rf.value_num is not None and canon_unit and target_unit:
        if canon_unit == target_unit:
            value_canonical = float(rf.value_num)
        else:
            converted = convert(float(rf.value_num), canon_unit, target_unit)
            if converted is not None:
                value_canonical = converted

    period_start, period_end = _parse_period(rf.period_text or "")

    comp = ConfidenceComponents(
        model_logprob=float(rf.model_logprob) if rf.model_logprob is not None else 0.85,
        cross_validation=1.0 if _passes_constraints(rf.value_num, metric_def) else 0.0,
        peer_zscore=1.0,
        schema_validation=1.0 if canon_unit else 0.4,
        cross_source=0.6 if low_conf else 1.0,
    )

    return ExtractedField(
        canonical_key=rf.canonical_key or "",
        value_text=rf.raw_value,
        value_num=rf.value_num,
        unit_extracted=rf.unit,
        unit_canonical=canon_unit,
        value_canonical=value_canonical,
        period_start=period_start,
        period_end=period_end,
        dimensions=rf.dimensions or {},
        source_page=rf.page,
        source_bbox=rf.bbox if isinstance(rf.bbox, BoundingBox) else None,
        source_row=rf.row,
        source_cell=rf.cell,
        source_sheet=rf.sheet,
        raw_text=rf.notes,
        confidence_components=comp,
        confidence_composite=0.0,  # filled by ConfidenceScorer
        confidence_level=ConfidenceLevel.MEDIUM,
        needs_review=needs_review,
        model_used=rf.model_used,
        prompt_version=rf.prompt_version,
    )


def _passes_constraints(value: Optional[float], metric_def: dict[str, Any]) -> bool:
    if value is None:
        return False
    c = metric_def.get("value_constraints") or {}
    if "min" in c and value < c["min"]:
        return False
    if "max" in c and value > c["max"]:
        return False
    return True


def _parse_period(text: str) -> tuple[Any, Any]:
    if not text:
        return None, None
    from datetime import date
    import re as _re

    # FY YYYY-YY or YYYY-YYYY
    m = _re.search(r"(?:FY\s*)?(20\d{2})\s*[-/–]\s*(20?\d{2,4})", text, _re.IGNORECASE)
    if m:
        y1 = int(m.group(1))
        y2_raw = m.group(2)
        y2 = int(y2_raw) if len(y2_raw) == 4 else (y1 // 100 * 100 + int(y2_raw))
        # Indian FY: 1 Apr → 31 Mar
        return date(y1, 4, 1), date(y2, 3, 31)
    m = _re.search(r"\b(20\d{2})\b", text)
    if m:
        y = int(m.group(1))
        return date(y, 1, 1), date(y, 12, 31)
    return None, None
