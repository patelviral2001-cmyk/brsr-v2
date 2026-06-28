"""PIIRedactor tests."""
from __future__ import annotations

from app.safety.pii_redactor import PIIRedactor


def test_redacts_email():
    text = "Contact us at jane.doe@example.com for queries."
    out, redactions = PIIRedactor().redact(text)
    assert "jane.doe@example.com" not in out
    assert "[REDACTED_EMAIL]" in out
    assert any(r.kind == "email" for r in redactions)


def test_redacts_indian_phone():
    text = "Call 9876543210 or +91 98765 43210."
    out, _ = PIIRedactor().redact(text)
    assert "9876543210" not in out
    assert "[REDACTED_PHONE]" in out


def test_redacts_pan():
    text = "PAN: ABCDE1234F is on file."
    out, _ = PIIRedactor().redact(text)
    assert "ABCDE1234F" not in out
    assert "[REDACTED_PAN]" in out


def test_redacts_aadhaar():
    text = "Aadhaar 1234 5678 9012 attached."
    out, _ = PIIRedactor().redact(text)
    assert "1234 5678 9012" not in out
    assert "[REDACTED_AADHAAR]" in out


def test_redacts_salary_line():
    text = "The CTO's CTC is INR 50,00,000 per annum."
    out, _ = PIIRedactor().redact(text)
    assert "[REDACTED_SALARY_LINE]" in out


def test_redacts_titled_name():
    text = "Approved by Mr. Rohan Kumar from finance."
    out, _ = PIIRedactor().redact(text)
    assert "Rohan Kumar" not in out
    assert "[REDACTED_NAME]" in out
