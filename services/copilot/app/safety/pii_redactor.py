"""
PII redactor.

Used before:
  - Embedding text into Qdrant (so the vector store never sees raw PII).
  - Sending RAG context to the LLM as part of a prompt.

Redaction targets (Indian-context priority):
  - Email addresses
  - Phone numbers (Indian + international formats)
  - PAN
  - Aadhaar (12-digit; we redact even partial matches because they often co-occur with names)
  - Salary lines (any line mentioning Rs/INR with a number AND a "salary"/"CTC"/"wages" word)
  - Employee names that appear next to designation keywords ("Mr.", "Ms.", "Dr.")
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)"
    r"|(?<!\d)\+?\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)"
)
_PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
_AADHAAR_RE = re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b")
_TITLE_NAME_RE = re.compile(
    r"\b(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Shri|Smt\.?)\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})"
)
_SALARY_LINE_RE = re.compile(
    r"^.*\b(salary|ctc|wages?|gross\s+pay|remuneration)\b.*?(?:INR|Rs\.?|₹)\s*[\d,]+(?:\.\d+)?.*$",
    re.IGNORECASE | re.MULTILINE,
)


@dataclass(frozen=True, slots=True)
class Redaction:
    kind: str
    span: tuple[int, int]


class PIIRedactor:
    def redact(self, text: str) -> tuple[str, list[Redaction]]:
        if not text:
            return text, []
        out = text
        redactions: list[Redaction] = []

        # Order matters: redact emails / phones before PAN-like sequences so we
        # don't double-process.
        for kind, pattern, replacement in self._patterns():
            out, found = _replace_all(out, pattern, replacement)
            for span in found:
                redactions.append(Redaction(kind=kind, span=span))

        return out, redactions

    def _patterns(self) -> Iterable[tuple[str, re.Pattern[str], str]]:
        return [
            ("email", _EMAIL_RE, "[REDACTED_EMAIL]"),
            ("phone", _PHONE_RE, "[REDACTED_PHONE]"),
            ("pan", _PAN_RE, "[REDACTED_PAN]"),
            ("aadhaar", _AADHAAR_RE, "[REDACTED_AADHAAR]"),
            ("salary_line", _SALARY_LINE_RE, "[REDACTED_SALARY_LINE]"),
            ("named_person", _TITLE_NAME_RE, r"\1 [REDACTED_NAME]"),
        ]


def _replace_all(
    text: str, pattern: re.Pattern[str], replacement: str
) -> tuple[str, list[tuple[int, int]]]:
    spans: list[tuple[int, int]] = []
    for m in pattern.finditer(text):
        spans.append(m.span())
    if not spans:
        return text, []
    new_text = pattern.sub(replacement, text)
    return new_text, spans
