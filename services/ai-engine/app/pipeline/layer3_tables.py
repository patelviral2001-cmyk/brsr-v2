"""Layer 3 — Table Extraction.

Given the table regions produced by layer 2, this layer:

  * Normalises headers (case-fold, strip non-alphanumerics).
  * Maps normalised headers to canonical metric keys via the registry's
    alias index.
  * Emits ``TableFieldRow`` records: ``{canonical_key, value, unit,
    period_hint, row_index, raw_label, source_table_label}``.
  * Handles merged cells (carry value down), total rows (kept but flagged
    so layer 5 doesn't double-count), and multi-line headers (two-row
    headers are concatenated for matching).

No LLM calls.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

from app.pipeline.layer2_layout import LayoutPage, TableRegion
from app.registry import METRIC_REGISTRY, alias_index, find_by_alias, get_metric
from app.utils.logging import get_logger
from app.utils.units import canonical_unit, parse_numeric

logger = get_logger("pipeline.layer3")


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


@dataclass
class TableFieldRow:
    canonical_key: str
    value: Optional[float]
    raw_value: str
    unit: Optional[str]
    period_hint: Optional[str]
    row_index: int
    raw_label: str
    source_table_label: str
    source_page: int = 1
    is_total_row: bool = False
    confidence_hint: float = 0.85


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_NORM_RE = re.compile(r"[^a-z0-9]+")


def _norm_header(s: str) -> str:
    return _NORM_RE.sub(" ", (s or "").lower()).strip()


_VALUE_RE = re.compile(r"-?[\d,]+(?:\.\d+)?")


def _extract_number_and_unit(cell: str) -> tuple[Optional[float], Optional[str]]:
    if cell is None:
        return None, None
    s = str(cell).strip()
    if not s:
        return None, None
    m = _VALUE_RE.search(s)
    if not m:
        return None, None
    num = parse_numeric(m.group(0))
    # Anything trailing the number that isn't another number is likely the unit.
    tail = s[m.end():].strip()
    head = s[: m.start()].strip()
    unit = None
    for cand in (tail, head):
        cand = re.sub(r"[\(\)\[\]]", "", cand).strip()
        if not cand:
            continue
        canon = canonical_unit(cand)
        if canon:
            unit = canon
            break
        # Take first token as a guess.
        first = cand.split()[0]
        canon = canonical_unit(first)
        if canon:
            unit = canon
            break
    return num, unit


_TOTAL_HINTS = ("total", "grand total", "sum", "subtotal")


def _is_total_row(first_cell: str) -> bool:
    s = (first_cell or "").strip().lower()
    return any(h in s for h in _TOTAL_HINTS)


_PERIOD_LABELS = (
    "period", "month", "billing period", "from", "to", "fy", "year", "billing month",
)


# ---------------------------------------------------------------------------
# Layer
# ---------------------------------------------------------------------------


class Layer3Tables:
    """Layer 3 — turn table regions into ``TableFieldRow`` records."""

    def __init__(self) -> None:
        self._aliases = alias_index()

    async def extract_tables(
        self, pages: list[LayoutPage], *, doc_type: Optional[str] = None
    ) -> list[TableFieldRow]:
        out: list[TableFieldRow] = []
        for page in pages:
            for tbl in page.tables:
                out.extend(self._process_table(tbl, page_no=page.page_no))
        return out

    # ------------------------------------------------------------------
    def _process_table(self, tbl: TableRegion, *, page_no: int) -> list[TableFieldRow]:
        if not tbl.header_row and not tbl.data_rows:
            return []
        header = self._merge_multiline_headers(tbl)
        if not header:
            return []
        normalized = [_norm_header(h) for h in header]
        header_to_key = self._headers_to_metric_keys(normalized)

        # If no header column maps, try row-oriented mapping (label/value tables).
        if not any(header_to_key):
            return self._extract_label_value(tbl, page_no=page_no)

        # Detect period and unit columns separately.
        period_col_idx = self._find_period_column(normalized)
        unit_col_idx = self._find_unit_column(normalized)

        # Track merged cell carry-down per column.
        last_seen: list[str] = [""] * len(header)
        out: list[TableFieldRow] = []
        for r_idx, row in enumerate(tbl.data_rows):
            if not row:
                continue
            # Carry-down for merged cells.
            row_filled: list[str] = []
            for c_idx in range(len(header)):
                cell = row[c_idx] if c_idx < len(row) else ""
                cell = (cell or "").strip()
                if not cell:
                    cell = last_seen[c_idx]
                else:
                    last_seen[c_idx] = cell
                row_filled.append(cell)

            period_hint = (
                row_filled[period_col_idx] if period_col_idx is not None and period_col_idx < len(row_filled) else None
            )
            unit_default = (
                row_filled[unit_col_idx] if unit_col_idx is not None and unit_col_idx < len(row_filled) else None
            )
            unit_default_canon = canonical_unit(unit_default) if unit_default else None
            is_total = _is_total_row(row_filled[0]) if row_filled else False

            for c_idx, key in enumerate(header_to_key):
                if not key:
                    continue
                if c_idx >= len(row_filled):
                    continue
                cell = row_filled[c_idx]
                if not cell:
                    continue
                num, unit = _extract_number_and_unit(cell)
                if num is None:
                    continue
                effective_unit = unit or unit_default_canon
                out.append(
                    TableFieldRow(
                        canonical_key=key,
                        value=num,
                        raw_value=cell,
                        unit=effective_unit,
                        period_hint=period_hint,
                        row_index=r_idx,
                        raw_label=header[c_idx],
                        source_table_label=tbl.semantic_label,
                        source_page=page_no,
                        is_total_row=is_total,
                        confidence_hint=0.88 if effective_unit else 0.78,
                    )
                )
        return out

    # ------------------------------------------------------------------
    def _extract_label_value(self, tbl: TableRegion, *, page_no: int) -> list[TableFieldRow]:
        """Row-oriented: first column = label, second = value."""
        out: list[TableFieldRow] = []
        rows: list[list[str]] = []
        if tbl.header_row:
            rows.append(tbl.header_row)
        rows.extend(tbl.data_rows)
        for r_idx, row in enumerate(rows):
            if len(row) < 2:
                continue
            label = (row[0] or "").strip()
            val = (row[1] or "").strip()
            unit_hint = (row[2].strip() if len(row) > 2 else "")
            key = find_by_alias(label)
            if not key:
                continue
            num, unit = _extract_number_and_unit(val)
            if num is None:
                continue
            if not unit and unit_hint:
                unit = canonical_unit(unit_hint)
            out.append(
                TableFieldRow(
                    canonical_key=key,
                    value=num,
                    raw_value=val,
                    unit=unit,
                    period_hint=None,
                    row_index=r_idx,
                    raw_label=label,
                    source_table_label=tbl.semantic_label,
                    source_page=page_no,
                    is_total_row=_is_total_row(label),
                    confidence_hint=0.85 if unit else 0.75,
                )
            )
        return out

    # ------------------------------------------------------------------
    def _merge_multiline_headers(self, tbl: TableRegion) -> list[str]:
        """If the first data row looks like a continuation of the header
        (mostly non-numeric), concatenate it with the header row."""
        header = list(tbl.header_row or [])
        if not header and tbl.data_rows:
            header = list(tbl.data_rows[0])
        if header and tbl.data_rows:
            first = tbl.data_rows[0]
            if first is not header and _looks_like_header(first):
                merged = []
                for i in range(max(len(header), len(first))):
                    a = header[i] if i < len(header) else ""
                    b = first[i] if i < len(first) else ""
                    merged.append((a + " " + b).strip())
                header = merged
        return header

    # ------------------------------------------------------------------
    def _headers_to_metric_keys(self, normalized_headers: list[str]) -> list[Optional[str]]:
        out: list[Optional[str]] = []
        for h in normalized_headers:
            if not h:
                out.append(None)
                continue
            key = self._aliases.get(h)
            if not key:
                # Fuzzy substring fallback — favour longer alias matches.
                key = find_by_alias(h)
            out.append(key)
        return out

    # ------------------------------------------------------------------
    def _find_period_column(self, normalized_headers: list[str]) -> Optional[int]:
        for i, h in enumerate(normalized_headers):
            if any(lbl in h for lbl in _PERIOD_LABELS):
                return i
        return None

    def _find_unit_column(self, normalized_headers: list[str]) -> Optional[int]:
        for i, h in enumerate(normalized_headers):
            if h.strip() in {"unit", "uom", "units", "measure"}:
                return i
        return None


# ---------------------------------------------------------------------------
# Heuristics
# ---------------------------------------------------------------------------


def _looks_like_header(row: list[str]) -> bool:
    if not row:
        return False
    numeric = 0
    nonempty = 0
    for c in row:
        s = (c or "").strip()
        if not s:
            continue
        nonempty += 1
        if _VALUE_RE.search(s):
            numeric += 1
    if nonempty == 0:
        return False
    # Very few numbers (<20%) and lots of words => header-ish.
    return (numeric / nonempty) < 0.2
