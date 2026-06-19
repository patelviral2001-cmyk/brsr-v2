"""Layer 4 — Vision / Text LLM Field Extraction.

Given the layout pages from Layer 2, extract metrics from the
*unstructured* text (i.e. everything outside table regions). When an
OpenAI API key is configured we ask GPT-5 (the project default) for a
constrained JSON output containing only metrics from the canonical
registry.

When no key is configured (offline benchmark mode), we fall back to a
regex / alias-based extractor that uses the registry's ``regex_patterns``
and aliases plus value/unit heuristics. The fallback is intentionally
strong enough that the offline benchmark scores meaningfully.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterable, Optional

from app.config import TaskType, get_settings
from app.llm.openai_helper import json_schema_to_response_format
from app.pipeline.layer2_layout import LayoutPage, TextBlock
from app.registry import METRIC_REGISTRY, alias_index, get_metric
from app.utils.logging import get_logger
from app.utils.units import canonical_unit, parse_numeric

logger = get_logger("pipeline.layer4")


@dataclass
class ExtractedTextField:
    metric_key: str
    value: Optional[float]
    raw_text: str
    unit: Optional[str]
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    source_page: int = 1
    source_bbox: Optional[tuple[float, float, float, float]] = None
    confidence_hint: float = 0.75


# ---------------------------------------------------------------------------
# Schema for LLM JSON output
# ---------------------------------------------------------------------------


def _extraction_schema(keys: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "fields": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "metric_key": {"type": "string", "enum": keys},
                        "value": {"type": ["number", "string", "null"]},
                        "unit": {"type": ["string", "null"]},
                        "period_start": {"type": ["string", "null"]},
                        "period_end": {"type": ["string", "null"]},
                        "raw_text": {"type": ["string", "null"]},
                        "confidence": {"type": ["number", "null"]},
                    },
                    "required": ["metric_key", "value"],
                },
            }
        },
        "required": ["fields"],
    }


# Regex period detection patterns.
_DATE_PATTERNS: list[re.Pattern] = [
    re.compile(
        r"\b(?:period|billing period|month|from)\s*[:\-]?\s*"
        r"(\d{1,2})\s*[\-/\s]\s*([A-Za-z]+)\s*[\-/\s]\s*(\d{2,4})"
        r"(?:\s*(?:to|-)\s*(\d{1,2})\s*[\-/\s]\s*([A-Za-z]+)\s*[\-/\s]\s*(\d{2,4}))?",
        re.I,
    ),
    re.compile(
        r"\b(?:period|billing period|month|from)\s*[:\-]?\s*"
        r"([A-Za-z]+)\s+(\d{4})"
        r"(?:\s*(?:to|-)\s*([A-Za-z]+)\s+(\d{4}))?",
        re.I,
    ),
    re.compile(
        r"\bFY\s*(\d{2,4})\s*[-/]\s*(\d{2,4})\b", re.I
    ),
]

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _month_idx(s: str) -> Optional[int]:
    return _MONTHS.get((s or "").strip().lower())


def _parse_period(text: str) -> tuple[Optional[date], Optional[date]]:
    if not text:
        return None, None
    for pat in _DATE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        groups = list(m.groups())
        if pat is _DATE_PATTERNS[2]:
            # FY 2024-25 -> 2024-04-01..2025-03-31
            try:
                y1 = int(groups[0])
                y2 = int(groups[1])
                if y1 < 100:
                    y1 += 2000
                if y2 < 100:
                    y2 += 2000
                return date(y1, 4, 1), date(y2, 3, 31)
            except Exception:  # noqa: BLE001
                continue
        if pat is _DATE_PATTERNS[0]:
            try:
                d1 = int(groups[0])
                m1 = _month_idx(groups[1])
                y1 = int(groups[2])
                if y1 < 100:
                    y1 += 2000
                start = date(y1, m1 or 1, d1)
                end = start
                if groups[3]:
                    d2 = int(groups[3])
                    m2 = _month_idx(groups[4])
                    y2 = int(groups[5])
                    if y2 < 100:
                        y2 += 2000
                    end = date(y2, m2 or 1, d2)
                return start, end
            except Exception:  # noqa: BLE001
                continue
        if pat is _DATE_PATTERNS[1]:
            try:
                m1 = _month_idx(groups[0])
                y1 = int(groups[1])
                if y1 < 100:
                    y1 += 2000
                start = date(y1, m1 or 1, 1)
                end = start
                if groups[2]:
                    m2 = _month_idx(groups[2])
                    y2 = int(groups[3])
                    if y2 < 100:
                        y2 += 2000
                    end = date(y2, m2 or 1, 28)
                return start, end
            except Exception:  # noqa: BLE001
                continue
    return None, None


# ---------------------------------------------------------------------------
# Layer
# ---------------------------------------------------------------------------


class Layer4Vision:
    def __init__(self) -> None:
        self.s = get_settings()
        self._aliases = alias_index()

    async def extract_from_text(
        self,
        pages: list[LayoutPage],
        *,
        doc_type: Optional[str] = None,
        period_hint_text: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> list[ExtractedTextField]:
        # ------------------------------------------------------------------
        # Pre-pass: domain-specific rule extractors.
        # When we recognise a known document family AND the rule extractor
        # is high-confidence, we skip the LLM entirely. This is where the
        # 80-95% LLM cost reduction comes from on utility-bill workloads.
        # ------------------------------------------------------------------
        rule_fields = self._try_rule_extractors(pages, doc_type=doc_type)
        if rule_fields:
            covered_keys = {f.metric_key for f in rule_fields}
            # If the rule pass covered the most-important headline fields
            # for this doc type, skip the LLM. The threshold is per-type
            # because each doc family has a different "minimum useful set".
            if self._rule_coverage_is_complete(doc_type, covered_keys):
                logger.info(
                    "layer4.llm_skipped",
                    reason="rule_extractor_complete",
                    doc_type=doc_type,
                    fields=len(rule_fields),
                    tenant=tenant_id or "",
                )
                return rule_fields

        # Build the "unstructured" text per page (every block, since tables
        # are tracked separately).
        if self.s.OPENAI_API_KEY:
            try:
                llm_fields = await self._extract_llm(
                    pages, doc_type=doc_type, tenant_id=tenant_id or ""
                )
                # Merge rule + LLM, preferring rule values where both fired.
                return _merge_rule_and_llm(rule_fields, llm_fields)
            except Exception as e:  # noqa: BLE001
                logger.warning("layer4.llm_failed", err=str(e))
        # Offline path: rule pass + regex fallback.
        regex_fields = self._extract_regex(pages, period_hint_text=period_hint_text)
        return _merge_rule_and_llm(rule_fields, regex_fields)

    # ------------------------------------------------------------------
    # Domain-specific rule extractor dispatch
    # ------------------------------------------------------------------
    def _try_rule_extractors(
        self, pages: list[LayoutPage], *, doc_type: Optional[str]
    ) -> list[ExtractedTextField]:
        joined = "\n".join(p.text for p in pages)
        if not joined:
            return []

        # Electricity bill specialist (Indian DISCOMs).
        # We try it on UTILITY_BILL, ELECTRICITY_BILL, the unhinted case,
        # OTHER (when the classifier is uncertain), and UNKNOWN (when the
        # classifier hasn't seen this format before — e.g. MSEDCL bills
        # whose Marathi script throws off the classifier). The extractor
        # has its own DISCOM header signature so it self-gates safely.
        if doc_type in (None, "UTILITY_BILL", "ELECTRICITY_BILL", "OTHER", "UNKNOWN"):
            try:
                from app.extractors.electricity_discom import extract as discom_extract

                result = discom_extract(joined)
                if result and result.is_high_confidence:
                    out = self._fields_from_rule(result, family="electricity_discom",
                                                  extra={"discom": result.discom})
                    if out:
                        return out
            except Exception as e:  # noqa: BLE001
                logger.warning("layer4.rule_extractor_failed",
                               family="electricity_discom", err=str(e))

        # Water bill specialist.
        if doc_type in (None, "WATER_BILL", "UTILITY_BILL", "OTHER"):
            try:
                from app.extractors.water_bill import extract as water_extract

                result = water_extract(joined)
                if result and result.is_high_confidence:
                    out = self._fields_from_rule(result, family="water_bill")
                    if out:
                        return out
            except Exception as e:  # noqa: BLE001
                logger.warning("layer4.rule_extractor_failed",
                               family="water_bill", err=str(e))

        # HR headcount specialist.
        if doc_type in (None, "HR_HEADCOUNT_SHEET", "HR_REGISTER", "PAYROLL", "OTHER"):
            try:
                from app.extractors.hr_headcount import extract as hr_extract

                result = hr_extract(joined)
                if result and result.is_high_confidence:
                    out = self._fields_from_rule(result, family="hr_headcount")
                    if out:
                        return out
            except Exception as e:  # noqa: BLE001
                logger.warning("layer4.rule_extractor_failed",
                               family="hr_headcount", err=str(e))

        # Waste manifest specialist.
        if doc_type in (None, "WASTE_MANIFEST", "OTHER"):
            try:
                from app.extractors.waste_manifest import extract as waste_extract

                result = waste_extract(joined)
                if result and result.is_high_confidence:
                    out = self._fields_from_rule(result, family="waste_manifest")
                    if out:
                        return out
            except Exception as e:  # noqa: BLE001
                logger.warning("layer4.rule_extractor_failed",
                               family="waste_manifest", err=str(e))

        return []

    def _fields_from_rule(
        self,
        result: Any,
        *,
        family: str,
        extra: Optional[dict[str, Any]] = None,
    ) -> list[ExtractedTextField]:
        """Convert a domain extractor's result into ExtractedTextField list,
        filtering through the canonical METRIC_REGISTRY so unknown keys never
        reach the response."""
        from app.registry import METRIC_REGISTRY

        out: list[ExtractedTextField] = []
        for df in result.fields:
            if df.metric_key not in METRIC_REGISTRY:
                continue
            out.append(
                ExtractedTextField(
                    metric_key=df.metric_key,
                    value=float(df.value) if isinstance(df.value, (int, float)) else None,
                    raw_text=df.raw_text,
                    unit=df.unit,
                    period_start=result.period_start,
                    period_end=result.period_end,
                    source_page=1,
                    confidence_hint=df.confidence,
                )
            )
        logger.info(
            "layer4.rule_extractor_fired",
            family=family,
            confidence=round(result.overall_confidence, 3),
            fields=len(out),
            **(extra or {}),
        )
        return out

    @staticmethod
    def _rule_coverage_is_complete(
        doc_type: Optional[str], covered: set[str]
    ) -> bool:
        # Minimum headline-field set per doc type. If the rule pass already
        # captured these, the LLM has nothing to add — and would only
        # introduce hallucination risk on the rest.
        required: dict[str, set[str]] = {
            "UTILITY_BILL":      {"purchased_electricity_kwh"},
            "ELECTRICITY_BILL":  {"purchased_electricity_kwh"},
            "UNKNOWN":           {"purchased_electricity_kwh"},
            "OTHER":             {"purchased_electricity_kwh"},
            "WATER_BILL":         {"water_withdrawn_total_kl"},
            "WASTE_MANIFEST":     {"waste_hazardous_kg", "waste_non_hazardous_kg"},
            "HR_HEADCOUNT_SHEET": {"employee_count_total"},
            "HR_REGISTER":        {"employee_count_total"},
        }
        needed = required.get(doc_type or "", set())
        return bool(needed) and needed.issubset(covered)

    # ------------------------------------------------------------------
    async def _extract_llm(
        self, pages: list[LayoutPage], *, doc_type: Optional[str], tenant_id: str
    ) -> list[ExtractedTextField]:
        from app.llm.router import get_router  # local import for offline mode safety

        router = get_router()
        keys = sorted(METRIC_REGISTRY.keys())
        schema = _extraction_schema(keys)
        response_format = json_schema_to_response_format(
            schema, name="ExtractionFields", strict=False
        )
        # Build prompt — page text + layout summary.
        pages_payload: list[dict[str, Any]] = []
        for p in pages:
            pages_payload.append(
                {
                    "page": p.page_no,
                    "blocks_count": len(p.blocks),
                    "tables_count": len(p.tables),
                    "text": "\n".join(b.text for b in p.blocks)[:6000],
                }
            )
        system = (
            "You are an ESG metric extractor. Read the document text below "
            "and return only metrics from this fixed list. Numeric values "
            "are required (or null if unknown). Use canonical units when "
            "possible. Do not invent metric keys outside the list."
        )
        user = json.dumps(
            {
                "doc_type": doc_type,
                "allowed_metric_keys": keys[:200],  # keep prompt short — registry too large to inline fully
                "pages": pages_payload,
            },
            ensure_ascii=False,
        )
        result = await router.chat(
            task=TaskType.EXTRACT_ENTITY,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            prompt_version="layer4_vision_v1",
            tenant_id=tenant_id,
            response_format=response_format,
        )
        parsed = result.parsed or {}
        fields_out: list[ExtractedTextField] = []
        for f in parsed.get("fields", []):
            mk = str(f.get("metric_key", "")).strip()
            if mk not in METRIC_REGISTRY:
                continue
            val = f.get("value")
            v_num = parse_numeric(str(val)) if val is not None else None
            unit = canonical_unit(str(f.get("unit") or "")) or None
            ps = _safe_date(f.get("period_start"))
            pe = _safe_date(f.get("period_end"))
            fields_out.append(
                ExtractedTextField(
                    metric_key=mk,
                    value=v_num,
                    raw_text=str(f.get("raw_text") or "")[:240],
                    unit=unit,
                    period_start=ps,
                    period_end=pe,
                    source_page=1,
                    confidence_hint=float(f.get("confidence") or 0.8),
                )
            )
        return fields_out

    # ------------------------------------------------------------------
    def _extract_regex(
        self, pages: list[LayoutPage], *, period_hint_text: Optional[str]
    ) -> list[ExtractedTextField]:
        out: list[ExtractedTextField] = []
        doc_text_joined = "\n".join(p.text for p in pages)
        global_period = _parse_period(doc_text_joined)

        for page in pages:
            text = page.text
            if not text:
                continue
            ps, pe = _parse_period(text)
            if ps is None and global_period[0] is not None:
                ps, pe = global_period
            # Try every metric's regex patterns.
            for key, meta in METRIC_REGISTRY.items():
                for pat in meta.get("regex_patterns", []):
                    try:
                        rx = re.compile(pat, re.I)
                    except re.error:
                        continue
                    for m in rx.finditer(text):
                        captured = m.group(1) if m.groups() else None
                        if captured is None:
                            continue
                        val = parse_numeric(captured)
                        if val is None:
                            continue
                        # Try to find a unit in the matched window.
                        window = text[max(0, m.start() - 20): m.end() + 30]
                        unit = _detect_unit_in_window(window, meta.get("unit"))
                        out.append(
                            ExtractedTextField(
                                metric_key=key,
                                value=val,
                                raw_text=text[max(0, m.start() - 10): m.end() + 30],
                                unit=unit or meta.get("unit"),
                                period_start=ps,
                                period_end=pe,
                                source_page=page.page_no,
                                confidence_hint=0.82,
                            )
                        )
            # Try simple "<label>: <value> <unit>" lines via alias matching.
            for block in page.blocks:
                t = block.text
                m = re.match(
                    r"^([A-Za-z0-9 \-\(\)/&\.,]+?)\s*[:=\-]\s*([\d,\.]+)\s*([A-Za-z%₹]+)?\s*$",
                    t,
                )
                if not m:
                    continue
                label, val_s, unit_s = m.group(1).strip(), m.group(2), m.group(3)
                key = self._aliases.get(label.lower())
                if not key:
                    # Try fuzzy substring match against aliases.
                    from app.registry import find_by_alias
                    key = find_by_alias(label)
                if not key:
                    continue
                val = parse_numeric(val_s)
                if val is None:
                    continue
                unit = canonical_unit(unit_s or "")
                out.append(
                    ExtractedTextField(
                        metric_key=key,
                        value=val,
                        raw_text=t,
                        unit=unit,
                        period_start=ps,
                        period_end=pe,
                        source_page=page.page_no,
                        confidence_hint=0.86 if unit else 0.76,
                    )
                )
        return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_UNIT_TOKENS = [
    "kWh", "MWh", "GWh", "GJ", "MJ", "kJ", "TJ", "kcal",
    "kg", "g", "tonnes", "ton", "lb",
    "L", "kL", "mL", "ML", "scm", "Nm3", "m3",
    "INR", "USD", "lakh", "crore",
    "tCO2e", "kgCO2e",
    "pct", "%", "count", "hours", "days",
]


def _detect_unit_in_window(window: str, default: Optional[str]) -> Optional[str]:
    win = (window or "").strip()
    if not win:
        return default
    lower = win.lower()
    for tok in _UNIT_TOKENS:
        if tok.lower() in lower:
            return canonical_unit(tok) or tok
    return default


def _safe_date(s: Any) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:  # noqa: BLE001
        return None


def _merge_rule_and_llm(
    rule_fields: list[ExtractedTextField],
    other_fields: list[ExtractedTextField],
) -> list[ExtractedTextField]:
    """Merge two extracted-field lists, preferring rule values where both fire.

    Rule extractors are deterministic and audit-traceable. When both passes
    return a value for the same metric_key, the rule value wins; the LLM
    output is kept only for keys the rule pass didn't cover.
    """
    if not rule_fields:
        return other_fields
    by_key: dict[str, ExtractedTextField] = {f.metric_key: f for f in rule_fields}
    for f in other_fields:
        if f.metric_key not in by_key:
            by_key[f.metric_key] = f
    return list(by_key.values())
