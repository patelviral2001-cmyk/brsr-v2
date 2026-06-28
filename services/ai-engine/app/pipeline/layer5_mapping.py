"""Layer 5 — Mapping / normalisation.

Combines the structured ``TableFieldRow`` records from Layer 3 and
``ExtractedTextField`` records from Layer 4 into a list of
``NormalizedField``. Steps:

  1. Resolve every metric_key against ``METRIC_REGISTRY`` (fuzzy alias
     match if not already canonical).
  2. Normalise unit to the canonical unit and convert ``value`` via
     :func:`app.utils.units.convert` so all downstream comparisons use
     the same scale.
  3. Drop rows whose value falls outside the metric's value constraints.
  4. Deduplicate by ``(canonical_key, period_start, scope_node)`` keeping
     the highest ``confidence_hint`` and merging raw evidence.

The output is a list of ``NormalizedField`` ready for Layer 6 validation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Optional

from app.pipeline.layer3_tables import TableFieldRow
from app.pipeline.layer4_vision_extractor import ExtractedTextField
from app.registry import METRIC_REGISTRY, find_by_alias, get_metric
from app.utils.logging import get_logger
from app.utils.units import canonical_unit, convert

logger = get_logger("pipeline.layer5")


@dataclass
class NormalizedField:
    canonical_key: str
    value: Optional[float]
    value_canonical: Optional[float]
    unit_extracted: Optional[str]
    unit_canonical: Optional[str]
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    raw_text: str = ""
    source_page: int = 1
    source_table_label: Optional[str] = None
    scope_node: Optional[str] = None  # e.g. facility / department
    confidence_hint: float = 0.75
    is_total_row: bool = False
    evidence: list[str] = field(default_factory=list)


class Layer5Mapping:
    """Layer 5 — merge, normalise, deduplicate."""

    async def normalize_and_merge(
        self,
        *,
        table_fields: Iterable[TableFieldRow],
        text_fields: Iterable[ExtractedTextField],
    ) -> list[NormalizedField]:
        merged: dict[tuple, NormalizedField] = {}

        for tf in table_fields:
            n = self._from_table(tf)
            if n is None:
                continue
            self._add(merged, n)

        for tx in text_fields:
            n = self._from_text(tx)
            if n is None:
                continue
            self._add(merged, n)

        return list(merged.values())

    # ------------------------------------------------------------------
    def _from_table(self, tf: TableFieldRow) -> Optional[NormalizedField]:
        key = self._canonicalise_key(tf.canonical_key)
        if not key:
            return None
        meta = get_metric(key) or {}
        v, u_canon = self._normalise(value=tf.value, unit=tf.unit, target=meta.get("unit"))
        if v is None:
            return None
        if not self._within_constraints(meta, v):
            return None
        ps, pe = None, None  # period parsed via text/period_hint downstream
        return NormalizedField(
            canonical_key=key,
            value=tf.value,
            value_canonical=v,
            unit_extracted=tf.unit,
            unit_canonical=u_canon,
            period_start=ps,
            period_end=pe,
            raw_text=tf.raw_value,
            source_page=tf.source_page,
            source_table_label=tf.source_table_label,
            scope_node=None,
            confidence_hint=tf.confidence_hint,
            is_total_row=tf.is_total_row,
            evidence=[tf.raw_label or ""],
        )

    def _from_text(self, tx: ExtractedTextField) -> Optional[NormalizedField]:
        key = self._canonicalise_key(tx.metric_key)
        if not key:
            return None
        meta = get_metric(key) or {}
        v, u_canon = self._normalise(value=tx.value, unit=tx.unit, target=meta.get("unit"))
        if v is None:
            return None
        if not self._within_constraints(meta, v):
            return None
        return NormalizedField(
            canonical_key=key,
            value=tx.value,
            value_canonical=v,
            unit_extracted=tx.unit,
            unit_canonical=u_canon,
            period_start=tx.period_start,
            period_end=tx.period_end,
            raw_text=tx.raw_text,
            source_page=tx.source_page,
            source_table_label=None,
            scope_node=None,
            confidence_hint=tx.confidence_hint,
            is_total_row=False,
            evidence=[tx.raw_text[:120]] if tx.raw_text else [],
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _canonicalise_key(key: Optional[str]) -> Optional[str]:
        if not key:
            return None
        if key in METRIC_REGISTRY:
            return key
        return find_by_alias(key)

    @staticmethod
    def _normalise(*, value: Optional[float], unit: Optional[str], target: Optional[str]) -> tuple[Optional[float], Optional[str]]:
        if value is None:
            return None, None
        if not target:
            return value, canonical_unit(unit) if unit else None
        canon_in = canonical_unit(unit) if unit else None
        canon_target = canonical_unit(target) or target
        if not canon_in:
            # Assume already in canonical units when unit was missing.
            return value, canon_target
        if canon_in == canon_target:
            return value, canon_target
        converted = convert(value, canon_in, canon_target)
        if converted is None:
            # Dimensions don't match — return original but with the source unit.
            return value, canon_in
        return converted, canon_target

    @staticmethod
    def _within_constraints(meta: dict, v: float) -> bool:
        c = meta.get("value_constraints") or {}
        if "min" in c and v < c["min"]:
            return False
        if "max" in c and v > c["max"]:
            return False
        return True

    @staticmethod
    def _dedupe_key(n: NormalizedField) -> tuple:
        return (n.canonical_key, n.period_start, n.scope_node)

    def _add(self, merged: dict[tuple, NormalizedField], n: NormalizedField) -> None:
        # Skip total-rows from deduplication priority — they are informational.
        if n.is_total_row:
            # Still keep it under a distinct key so it isn't lost.
            k = (n.canonical_key, "_TOTAL", n.scope_node)
        else:
            k = self._dedupe_key(n)
        existing = merged.get(k)
        if existing is None:
            merged[k] = n
            return
        # Keep highest confidence_hint; if tied, prefer the row with a unit.
        if (n.confidence_hint, bool(n.unit_canonical)) > (
            existing.confidence_hint,
            bool(existing.unit_canonical),
        ):
            n.evidence = (existing.evidence + n.evidence)[:6]
            merged[k] = n
        else:
            existing.evidence = (existing.evidence + n.evidence)[:6]
