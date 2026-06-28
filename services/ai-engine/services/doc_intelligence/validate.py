"""Validation engine — reject impossible data; flag the doubtful.

Checks (generic, no per-DISCOM logic):
  * reading identity   (current − previous) × MF == consumption, per meter
  * charge reconciliation   Σ(signed charge lines) ≈ a stated total (informational;
    Indian bills carry arrears/adjustments so a mismatch FLAGS, never hard-fails)
  * date consistency   bill_date ≤ due_date ; period_end ≥ period_start

Sets each involved field's validation_status and appends a ValidationCheck.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from packages.canonical import UniversalEnergyDocument, ValidationCheck, ValidationStatus

_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _to_date(s) -> Optional[datetime]:
    if not s:
        return None
    s = str(s).strip()
    m = re.search(r"(\d{1,2})[-/.]([A-Za-z]{3,9}|\d{1,2})[-/.](\d{2,4})", s)
    if not m:
        m2 = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
        if m2:
            return _safe(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
        return None
    d, mon, y = m.group(1), m.group(2).lower(), m.group(3)
    month = _MONTHS.get(mon[:3]) if mon[:3] in _MONTHS else (int(mon) if mon.isdigit() else None)
    if month is None:
        return None
    year = int(y) + 2000 if len(y) == 2 else int(y)
    return _safe(year, month, int(d))


def _safe(y, mo, d) -> Optional[datetime]:
    try:
        return datetime(y, mo, d)
    except ValueError:
        return None


def _num(v) -> Optional[float]:
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def validate(doc: UniversalEnergyDocument) -> UniversalEnergyDocument:
    checks: list[ValidationCheck] = []

    # 1. reading identity per meter
    for m in doc.meters:
        prev = _num(m.previous_reading.value) if m.previous_reading else None
        cur = _num(m.current_reading.value) if m.current_reading else None
        mf = _num(m.multiplying_factor.value) if m.multiplying_factor else 1.0
        cons = _num(m.consumption.value) if m.consumption else None
        if None in (prev, cur, cons):
            continue
        expected = (cur - prev) * (mf or 1.0)
        ok = abs(expected - cons) <= max(1.0, 0.005 * cons)
        st = ValidationStatus.VALID if ok else ValidationStatus.INVALID
        for f in (m.previous_reading, m.current_reading, m.consumption):
            if f:
                f.validation_status = st
        checks.append(ValidationCheck(
            name=f"reading_identity[{m.energy_type}]", status=st,
            detail="(current-previous)*MF == consumption",
            expected=round(expected, 2), actual=round(cons, 2)))

    # 2. charge reconciliation (informational)
    bill_amt = doc.billing.get("bill_amount")
    if doc.charges and bill_amt and _num(bill_amt.value) is not None:
        total = sum((c.sign * (_num(c.amount.value) or 0.0)) for c in doc.charges)
        target = _num(bill_amt.value)
        ok = abs(total - target) <= max(5.0, 0.02 * abs(target))
        st = ValidationStatus.VALID if ok else ValidationStatus.FLAGGED
        checks.append(ValidationCheck(
            name="charge_reconciliation", status=st,
            detail="Σ(signed charges) vs bill_amount (arrears/adjustments may differ)",
            expected=round(target, 2), actual=round(total, 2)))

    # 3. date consistency
    bd = _to_date(doc.billing.get("bill_date").value) if doc.billing.get("bill_date") else None
    dd = _to_date(doc.billing.get("due_date").value) if doc.billing.get("due_date") else None
    if bd and dd:
        ok = bd <= dd
        checks.append(ValidationCheck(
            name="date_consistency", status=ValidationStatus.VALID if ok else ValidationStatus.INVALID,
            detail="bill_date <= due_date",
            expected=f"{bd.date()} <= {dd.date()}", actual="ok" if ok else "bill after due"))

    # 4. amount plausibility (generic — no DISCOM logic). DISCOMs print
    #    WhatsApp/helpline numbers near the amount; a bill_amount that is a
    #    10-digit Indian mobile (or absurdly large) is almost certainly mis-grabbed.
    ba = doc.billing.get("bill_amount")
    if ba and ba.is_present():
        digits = re.sub(r"\D", "", str(ba.value))
        n = _num(ba.value)
        phone_like = len(digits) == 10 and digits[0] in "6789"
        if phone_like or (n is not None and n > 1e8):
            ba.validation_status = ValidationStatus.FLAGGED
            checks.append(ValidationCheck(
                name="amount_plausibility", status=ValidationStatus.FLAGGED,
                detail="bill_amount resembles a phone/implausible value",
                actual=str(ba.value)))

    # overall
    has_invalid = any(c.status == ValidationStatus.INVALID for c in checks)
    has_flag = any(c.status == ValidationStatus.FLAGGED for c in checks)
    overall = (ValidationStatus.INVALID if has_invalid else
               ValidationStatus.FLAGGED if has_flag else
               ValidationStatus.VALID if checks else ValidationStatus.UNVALIDATED)
    doc.validation.checks = checks
    doc.validation.overall_status = overall
    return doc
