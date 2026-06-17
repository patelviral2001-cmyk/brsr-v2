"""Document classifier tests — 10 sample cases against mocked LLM."""
from __future__ import annotations

import pytest

from app.agents.document_classifier import DocumentClassifier
from app.config import TaskType


CASES = [
    ("electricity_bill_apr25.pdf", "Tariff Rate ... Units Consumed ... 12345 kWh", "UTILITY_BILL", 0.92),
    ("payroll_apr25.xlsx", "Employee Code, Basic, HRA, Net Pay", "HR_PAYROLL", 0.88),
    ("headcount_master.xlsx", "Emp ID Name Gender Designation Joining Date", "HR_HEADCOUNT_SHEET", 0.91),
    ("water_bill.pdf", "Borewell extraction ... groundwater kL", "WATER_BILL", 0.83),
    ("manifest_form10.pdf", "Hazardous Waste Manifest Form 10", "WASTE_MANIFEST", 0.94),
    ("incident_report.pdf", "Near Miss Incident Report — Site 3", "EHS_INCIDENT_REPORT", 0.79),
    ("annual_financials.pdf", "Auditor's Report ... Balance Sheet ... Schedule III", "AUDITED_FINANCIALS", 0.95),
    ("board_minutes.pdf", "Minutes of the Board Meeting held on ...", "BOARD_MINUTES", 0.88),
    ("csr_form2.pdf", "Form CSR-2 Annexure ... CSR Spend Statement", "CSR_SPEND_REPORT", 0.93),
    ("supplier_saq.pdf", "Supplier Self-Assessment Questionnaire", "SUPPLIER_SAQ", 0.84),
]


@pytest.mark.parametrize("filename,preview,expected_type,expected_conf", CASES)
async def test_classify_each_case(fake_router, filename, preview, expected_type, expected_conf):
    fake_router.enqueue(
        TaskType.CLASSIFY,
        {"doc_type": expected_type, "confidence": expected_conf, "alternative_types": []},
    )
    clf = DocumentClassifier()
    out = await clf.classify(
        filename=filename,
        text_preview=preview,
        tenant_id="tenant-test",
    )
    assert out.doc_type == expected_type
    assert out.confidence == pytest.approx(expected_conf, abs=1e-3)


async def test_classify_unknown_on_llm_failure(fake_router, monkeypatch):
    from app.llm.router import LLMError

    async def boom(*a, **kw):
        raise LLMError("simulated")

    monkeypatch.setattr(fake_router, "chat", boom)
    clf = DocumentClassifier()
    out = await clf.classify(filename="x.pdf", text_preview="...", tenant_id="t")
    assert out.doc_type == "UNKNOWN"
    assert out.confidence == 0.0


async def test_classify_invalid_doctype_falls_back_to_unknown(fake_router):
    fake_router.enqueue(
        TaskType.CLASSIFY,
        {"doc_type": "MADE_UP_TYPE", "confidence": 0.9},
    )
    clf = DocumentClassifier()
    out = await clf.classify(filename="x.pdf", text_preview="...", tenant_id="t")
    assert out.doc_type == "UNKNOWN"
