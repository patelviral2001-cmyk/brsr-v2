"""Hybrid canonical mapper: dictionary-first, LLM-fallback.

1. DICTIONARY pass (deterministic, free): every layout KeyValue whose key the
   canonical dictionary recognizes becomes a CanonicalField in the right schema
   section / charge / energy-flow. Meter rows are parsed by a self-validating
   triple search (prev, current, consumption where current-prev == consumption),
   which is DISCOM-agnostic.
2. LLM FALLBACK (optional): for canonical fields still missing after the
   dictionary pass, an LLM provider is asked to find them in the layout text.
   Activated only when a key is configured; otherwise skipped cleanly.

No per-DISCOM parsers, no fixed coordinates, no reliance on text order beyond
generic geometric/line heuristics.
"""
from __future__ import annotations

import re
from typing import Optional

from packages.canonical import (CanonicalDictionary, CanonicalField, ChargeLine,
                                EnergyFlowEntry, MeterReading,
                                UniversalEnergyDocument)
from packages.canonical.schema import OcrSource as SchemaOcrSource

# identifiers must never be coerced to numbers (leading zeros / formatting matter)
IDENTIFIER_LABELS = {"account_number", "meter_number", "bill_number", "gstin",
                     "connection_type", "tariff"}
_UNIT_TOKENS = ["kvah", "kwh", "kva", "kw", "scm", "mmbtu", "litre", "ltr",
                "kl", "m3", "m³", "units", "rs", "₹"]
_NEGATIVE_CODES = {"rebate", "subsidy"}            # always reduce the bill
_NUM = re.compile(r"-?\d[\d,]*\.?\d*")


def _clean_value(raw: str) -> str:
    """Strip OCR/Form-Parser noise around a value: leading ':;|*★', collapse
    embedded newlines, trim. Generic — no field/issuer knowledge."""
    s = (raw or "").replace("\r", " ").replace("\n", " ").strip()
    s = re.sub(r"^[\s:;|*★·.\-]+", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _parse_value(raw: str) -> tuple[object, Optional[str]]:
    """Return (value, unit). Numeric strings → float/int; else the cleaned string."""
    s = (raw or "").strip()
    unit = None
    low = s.lower()
    for u in _UNIT_TOKENS:
        if u in low:
            unit = u.replace("m³", "m3")
            break
    m = _NUM.search(s.replace(",", ""))
    if m and re.fullmatch(r"-?\d[\d.]*", m.group().strip()):
        num = m.group()
        try:
            val = float(num) if "." in num else int(num)
            # keep the token only if it dominates the cell (avoid grabbing a digit
            # out of a word like an address)
            if re.fullmatch(r"-?\d[\d,]*\.?\d*\s*[a-z₹/]*", low.replace(",", "")):
                return val, unit
        except ValueError:
            pass
    return s, unit


def _field(label: str, raw_label: str, value, unit, conf, source) -> CanonicalField:
    return CanonicalField(canonical_label=label, value=value, unit=unit,
                          confidence=conf, raw_label=raw_label, ocr_source=source)


def _detect_issuer(text: str) -> Optional[str]:
    # generic: the first header line naming a utility entity (any case)
    for line in text.splitlines()[:8]:
        l = line.strip()
        if 8 <= len(l) <= 90 and re.search(
                r"NIGAM|LIMITED|COMPANY|POWER|BOARD|ELECTRICITY|VITRAN|DISCOM",
                l.upper()):
            return l
    return None


def _parse_meters(rows: list[dict], source) -> list[MeterReading]:
    meters: list[MeterReading] = []
    for row in rows:
        nums = []
        for n in row["numbers"]:
            try:
                nums.append(float(n))
            except ValueError:
                continue
        # self-validating triple: current - previous == consumption
        best = None
        for i in range(len(nums)):
            for j in range(len(nums)):
                if j == i:
                    continue
                for k in range(len(nums)):
                    if k in (i, j):
                        continue
                    a, b, c = nums[i], nums[j], nums[k]
                    if a >= 100 and b > a and abs((b - a) - c) < 0.5 and c > 0:
                        if best is None or a > best[0]:
                            best = (a, b, c)
        if not best:
            continue
        prev, cur, cons = best
        mf = 1.0
        for n in nums:
            if 0 < n <= 1000 and abs((cur - prev) * n - cons) < 0.5:
                mf = n
                break
        s = source
        meters.append(MeterReading(
            energy_type=row["energy_type"],
            previous_reading=_field("previous_reading", row["raw"][:40], prev, None, 0.9, s),
            current_reading=_field("current_reading", row["raw"][:40], cur, None, 0.9, s),
            multiplying_factor=_field("multiplying_factor", "MF", mf, None, 0.9, s),
            consumption=_field("consumption", row["raw"][:40], cons,
                               row["energy_type"], 0.9, s)))
    return meters


def map_layout(layout, doc_type: str, resolver: CanonicalDictionary,
               doc_type_conf: float = 1.0, llm=None) -> UniversalEnergyDocument:
    from services.ocr_service.providers.native_pdf import harvest_meter_rows

    src = SchemaOcrSource(layout.source.value) if hasattr(layout.source, "value") \
        else SchemaOcrSource.UNKNOWN
    doc = UniversalEnergyDocument()
    doc.document.set(_field("doc_type", "classifier", doc_type, None, doc_type_conf, src))
    issuer = _detect_issuer(layout.text)
    if issuer:
        doc.utility.set(_field("discom", "header", issuer, None, 0.8, src))

    sections = {"consumer": doc.consumer, "utility": doc.utility,
                "location": doc.location, "document": doc.document,
                "billing": doc.billing, "power_quality": doc.power_quality,
                "renewable": doc.renewable, "carbon": doc.carbon}
    seen_charges: set[str] = set()
    seen_flows: set[str] = set()

    for kv in layout.key_values():
        res = resolver.resolve(kv.key)
        if not res.canonical_label:
            continue
        cleaned = _clean_value(kv.value)
        if res.canonical_label in IDENTIFIER_LABELS:
            value, unit = cleaned, None
        else:
            value, unit = _parse_value(cleaned)
        # confidence blends OCR/value reliability (dominant) with label-match
        # certainty: a clean native value with an exact alias → ~1.0; with a
        # strong containment match → ~0.95. Avoids penalizing perfect text.
        conf = round(kv.value_conf * (0.7 + 0.3 * res.score), 3)
        fld = _field(res.canonical_label, kv.key, value, unit, conf, src)

        if res.kind == "charge":
            if res.canonical_label in seen_charges:
                continue
            sign = -1 if res.canonical_label in _NEGATIVE_CODES else 1
            doc.charges.append(ChargeLine(code=res.canonical_label, amount=fld, sign=sign))
            seen_charges.add(res.canonical_label)
        elif res.kind == "flow":
            if res.canonical_label in seen_flows:
                continue
            doc.energy_flow.append(EnergyFlowEntry(code=res.canonical_label, quantity=fld))
            seen_flows.add(res.canonical_label)
        else:
            sec = sections.get(res.section)
            if sec is not None and (sec.get(res.canonical_label) is None
                                    or not sec.get(res.canonical_label).is_present()):
                sec.set(fld)

    # meters → energy flow (grid import from the kWh meter)
    doc.meters = _parse_meters(harvest_meter_rows(layout.text), src)
    for m in doc.meters:
        if m.energy_type == "KWH" and m.consumption and m.consumption.is_present():
            doc.energy_flow.append(EnergyFlowEntry(
                code="grid_import",
                quantity=_field("grid_import", "kWh meter", m.consumption.value,
                                "kwh", m.consumption.confidence, src)))
            break

    # LLM fallback for still-missing critical fields
    missing = [c for c in CRITICAL_FIELDS if not _has(doc, c)]
    if llm is not None and missing:
        proposed = llm.fill(layout.text, doc_type, missing) or {}
        for label, (value, conf) in proposed.items():
            sec = _section_for(doc, label)
            if sec is not None and not _has(doc, label):
                sec.set(_field(label, "llm", value, None, conf, src))
        doc.metadata["llm_fallback_used"] = True
        doc.metadata["llm_filled"] = list(proposed.keys())

    doc.metadata["ocr_source"] = layout.source.value
    doc.metadata["mean_word_confidence"] = layout.mean_word_confidence
    doc.metadata["unmapped_labels"] = layout.provider_meta.get("router_choice")
    doc.carbon.fields.clear()       # carbon stays empty until factors are confirmed
    return doc


CRITICAL_FIELDS = ["account_number", "bill_amount", "bill_date"]
_LABEL_SECTION = {"account_number": "consumer", "bill_amount": "billing",
                  "bill_date": "billing", "consumer_name": "consumer",
                  "tariff": "consumer", "due_date": "billing"}


def _has(doc: UniversalEnergyDocument, label: str) -> bool:
    for sec in (doc.consumer, doc.billing, doc.utility, doc.location, doc.document):
        f = sec.get(label)
        if f and f.is_present():
            return True
    return False


def _section_for(doc: UniversalEnergyDocument, label: str):
    name = _LABEL_SECTION.get(label, "document")
    return {"consumer": doc.consumer, "billing": doc.billing,
            "utility": doc.utility, "location": doc.location,
            "document": doc.document}.get(name)
