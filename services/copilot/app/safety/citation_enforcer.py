"""
Citation enforcement.

Every numeric claim in a Copilot answer must trace to either:
  - a `metric_event_id` (i.e. an actual number from the warehouse), OR
  - a `document_id` + `page` (i.e. a chunk from RAG).

The model is instructed to emit `<cite ...>` tokens inline. This module:
  1) Parses the response, extracting every <cite> tag.
  2) Cross-checks each tag against the tool-use log (was the metric actually
     fetched? was the document actually retrieved?).
  3) For numeric claims (digits, percentages, currency) WITHOUT a citation
     within the same sentence, it surfaces a warning so the UI can flag.

We do NOT silently strip uncited claims — that would let bad answers ship.
Instead we surface them so the frontend can highlight in red.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# Tokens we recognise:
#   <cite metric="electricity_kwh" period="FY24-25"/>
#   <cite metric="electricity_kwh" period="FY24-25" event="me_123"/>
#   <cite doc="doc_456" page="12"/>
_CITE_RE = re.compile(
    r"<cite\s+(?P<attrs>[^/>]+?)\s*/?>",
    re.IGNORECASE,
)

# A "numeric claim" is any contiguous run of digits that looks like a quantity.
_NUMERIC_RE = re.compile(
    r"(?<![A-Za-z_])"
    r"(?:INR\s*|USD\s*|Rs\.?\s*|\$|₹)?"
    r"\d{1,3}(?:[,\s]?\d{3})*(?:\.\d+)?"
    r"(?:\s*%|\s*pct|\s*tCO2e|\s*kWh|\s*MWh|\s*KL|\s*kg|\s*tonnes|\s*GJ)?",
    re.IGNORECASE,
)
_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]?", re.DOTALL)


@dataclass(slots=True)
class CitationFinding:
    type: str  # "valid" | "unverified" | "missing"
    sentence: str
    cite: dict[str, str] | None = None
    numeric_claim: str | None = None


@dataclass(slots=True)
class EnforcementResult:
    citations: list[dict[str, Any]] = field(default_factory=list)
    findings: list[CitationFinding] = field(default_factory=list)


class CitationEnforcer:
    def enforce(self, text: str, tool_use_log: list[dict[str, Any]]) -> EnforcementResult:
        result = EnforcementResult()
        verified_metrics, verified_docs = _build_verified_sets(tool_use_log)

        for sent_match in _SENTENCE_RE.finditer(text):
            sentence = sent_match.group(0).strip()
            if not sentence:
                continue

            cite_attrs_in_sentence = list(_extract_cites(sentence))
            numeric_in_sentence = list(_extract_numerics(sentence))

            # Surface every <cite> we found, verified or not
            for attrs in cite_attrs_in_sentence:
                cite_kind, key = _classify_cite(attrs)
                if cite_kind == "metric":
                    verified = key in verified_metrics
                elif cite_kind == "doc":
                    verified = key in verified_docs
                else:
                    verified = False
                payload = {
                    "kind": cite_kind,
                    "key": key,
                    "attrs": attrs,
                    "sentence": sentence,
                    "verified": verified,
                }
                result.citations.append(payload)
                result.findings.append(
                    CitationFinding(
                        type="valid" if verified else "unverified",
                        sentence=sentence,
                        cite=attrs,
                    )
                )

            # Flag numeric claims without any citation in the same sentence
            if numeric_in_sentence and not cite_attrs_in_sentence:
                for n in numeric_in_sentence:
                    result.findings.append(
                        CitationFinding(
                            type="missing",
                            sentence=sentence,
                            numeric_claim=n,
                        )
                    )
                    result.citations.append(
                        {
                            "kind": "missing",
                            "key": None,
                            "attrs": {},
                            "sentence": sentence,
                            "numeric_claim": n,
                            "verified": False,
                        }
                    )

        return result


def _extract_cites(sentence: str):
    for m in _CITE_RE.finditer(sentence):
        attrs_str = m.group("attrs")
        yield _parse_attrs(attrs_str)


def _extract_numerics(sentence: str) -> list[str]:
    out: list[str] = []
    for m in _NUMERIC_RE.finditer(sentence):
        token = m.group(0).strip()
        if not token:
            continue
        # Skip year-like sequences (e.g. "2024") unless paired with a unit.
        if re.fullmatch(r"(19|20)\d{2}", token):
            continue
        out.append(token)
    return out


def _parse_attrs(attrs_str: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for am in re.finditer(r"(\w+)\s*=\s*\"([^\"]*)\"", attrs_str):
        out[am.group(1).lower()] = am.group(2)
    return out


def _classify_cite(attrs: dict[str, str]) -> tuple[str, str]:
    if "metric" in attrs:
        return "metric", attrs["metric"]
    if "doc" in attrs:
        return "doc", attrs["doc"]
    if "event" in attrs:
        return "metric_event", attrs["event"]
    return "unknown", ""


def _build_verified_sets(tool_use_log: list[dict[str, Any]]) -> tuple[set[str], set[str]]:
    """Walk the tool use log and collect metric keys and document IDs that were actually fetched."""
    metrics: set[str] = set()
    docs: set[str] = set()
    for entry in tool_use_log:
        name = entry.get("name", "")
        inp = entry.get("input", {}) or {}
        if name == "get_metric":
            key = inp.get("canonical_key")
            if key:
                metrics.add(key)
        elif name == "get_framework_completion":
            # Framework completion doesn't ground individual metrics — skip.
            continue
        elif name == "search_documents":
            preview = entry.get("result_preview") or ""
            # Best-effort: pull document IDs from the preview string.
            for m in re.finditer(r"\"document_id\"\s*:\s*\"([^\"]+)\"", preview):
                docs.add(m.group(1))
    return metrics, docs
