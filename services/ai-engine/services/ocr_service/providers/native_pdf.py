"""Native-PDF provider + generic text→layout harvester.

For native (digital) PDFs we extract the embedded text layer (no OCR, no cloud).
We then derive `KeyValue` pairs and meter-reading rows using GENERIC, layout-aware
heuristics — never per-DISCOM regex:

  * column pairing: a line split on 2+ space runs yields cells; a cell that the
    canonical dictionary recognizes as a label is paired with the adjacent
    value-like cell. The DICTIONARY decides what's a label, so this generalizes
    across issuers.
  * colon pairing: "Label : value" / Hindi-label "/Label: value".
  * reading rows: any line carrying an energy-type token (KWH/KVAH/KW/KVA/SCM/...)
    plus numbers is parsed as a metered line (prev / current / diff).

`from_text()` lets the offline demo feed an already-extracted text layer.
"""
from __future__ import annotations

import io
import re
from typing import Optional

from .base import (BBox, Block, Cell, KeyValue, NormalizedLayout, OcrSource,
                   Page, Table, Token)

ENERGY_TYPES = ("KVAH", "KWH", "KVA", "KW", "SCM", "MMBTU", "LITRE", "LTR", "M3", "KL")
_NUM = re.compile(r"-?\d[\d,]*\.?\d*")
_DATE = re.compile(r"\d{1,2}[-/.][A-Za-z0-9]{2,9}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2}")


def _value_like(s: str) -> bool:
    s = s.strip()
    if not s:
        return False
    if _DATE.search(s):
        return True
    if _NUM.fullmatch(s.replace(" ", "")):
        return True
    # short alphanumeric identifier (meter no, account no with dashes)
    if len(s) <= 30 and re.search(r"\d", s) and not re.search(r"\s{2,}", s):
        return True
    return False


def _split_cells(line: str) -> list[str]:
    return [c.strip() for c in re.split(r"\s{2,}|\t", line.strip()) if c.strip()]


def harvest_key_values(text: str, resolver=None) -> list[KeyValue]:
    """Generic KV harvest. If a `resolver` (CanonicalDictionary) is supplied it is
    used to confirm label cells in the column-pairing strategy (recommended)."""
    out: list[KeyValue] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # skip metered rows — those are parsed by harvest_meter_rows, and feeding
        # them here only produces spurious label→number pairs.
        up = line.upper()
        if any(re.search(rf"\b{e}\b", up) for e in ENERGY_TYPES) and \
                len(_NUM.findall(line)) >= 3:
            continue

        # Strategy 1 — colon pairing (first colon on the line).
        if ":" in line:
            label, _, rest = line.partition(":")
            value = _split_cells(rest)[0] if _split_cells(rest) else rest.strip()
            if label.strip() and value:
                out.append(KeyValue(key=label.strip(), value=value.strip()))

        # Strategy 2 — column pairing driven by the dictionary.
        cells = _split_cells(line)
        for i in range(len(cells) - 1):
            lab, nxt = cells[i], cells[i + 1]
            is_label = False
            if resolver is not None:
                is_label = resolver.resolve(lab).score >= 0.6
            if is_label and _value_like(nxt):
                out.append(KeyValue(key=lab, value=nxt))
            # also: label and value separated within one cell by single spaces,
            # e.g. "Payable Amount 72200"
        if resolver is not None:
            m = re.match(r"^(.*?)(-?\d[\d,]*\.?\d*)\s*$", line)
            if m and resolver.resolve(m.group(1)).score >= 0.6:
                out.append(KeyValue(key=m.group(1).strip(), value=m.group(2).strip()))
    return out


def harvest_meter_rows(text: str) -> list[dict]:
    """Generic metered-line parser. Returns dicts with energy_type + numbers found,
    leaving identity/role assignment to the mapper + validation engine."""
    rows: list[dict] = []
    for raw in text.splitlines():
        line = raw.strip()
        up = line.upper()
        et = next((e for e in ENERGY_TYPES if re.search(rf"\b{e}\b", up)), None)
        if not et:
            continue
        nums = [n.replace(",", "") for n in _NUM.findall(line)]
        nums = [n for n in nums if n not in ("", "-")]
        if len(nums) >= 2:
            rows.append({"energy_type": et, "numbers": nums, "raw": line})
    return rows


class NativePdfProvider:
    name = "native_pdf"

    def supports(self, mime: str, filename: str, data: bytes) -> bool:
        is_pdf = "pdf" in (mime or "").lower() or filename.lower().endswith(".pdf")
        if not is_pdf:
            return False
        return len(self._raw_text(data)) >= 200      # has a real text layer

    def extract(self, data: bytes, mime: str, filename: str = "") -> NormalizedLayout:
        text = self._raw_text(data)
        return self.from_text(text)

    @staticmethod
    def _raw_text(data: bytes) -> str:
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return "\n".join((p.extract_text() or "") for p in pdf.pages[:50]).strip()
        except Exception:
            return ""

    @classmethod
    def from_text(cls, text: str, resolver=None) -> NormalizedLayout:
        kvs = harvest_key_values(text, resolver=resolver)
        page = Page(number=1, blocks=[Block(text=text)], key_values=kvs,
                    languages=["en", "hi"])
        return NormalizedLayout(source=OcrSource.NATIVE_PDF, text=text, pages=[page],
                                languages=["en", "hi"], mean_word_confidence=1.0,
                                provider_meta={"note": "digital text layer"})
