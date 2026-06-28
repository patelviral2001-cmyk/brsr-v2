"""End-to-end orchestrator test with mocked LLM.

The ``fake_router`` fixture stands in for the real :class:`LLMRouter`
(which talks to OpenAI). It accepts the same kwargs the agents pass —
``response_format``, ``response_schema``, ``tools`` — and returns a parsed
payload modelling OpenAI's ``chat.completions`` response shape (a JSON
object decoded from ``choice.message.content``). No Anthropic-specific
fields appear in these mocks.
"""
from __future__ import annotations

import pytest

from app.config import TaskType
from app.models.requests import ExtractRequest
from app.models.responses import ExtractStatus
from app.orchestrator import DocumentOrchestrator


async def test_orchestrator_pdf_end_to_end(
    fake_router,
    patch_s3,
    patch_rag,
    sample_pdf_bytes,
):
    # ------------------------------------------------------------------
    # Canned responses — each `enqueue` represents one OpenAI
    # chat.completions response whose `choice.message.content` parses to
    # the dict passed as `parsed`.
    # ------------------------------------------------------------------
    # 1. Document classifier (gpt-5-nano)
    fake_router.enqueue(
        TaskType.CLASSIFY,
        {"doc_type": "UTILITY_BILL", "confidence": 0.9, "alternative_types": []},
        prompt_tokens=400,
        completion_tokens=40,
    )
    # 2. Many chunk_classifier calls — return predicted_keys = ['electricity_kwh']
    for _ in range(40):
        fake_router.enqueue(
            TaskType.CLASSIFY,
            {"predicted_keys": ["electricity_kwh"], "rationale": "ok"},
            prompt_tokens=600,
            completion_tokens=20,
        )
    # 3. Entity extraction (gpt-5) per (chunk, metric) pair
    for _ in range(40):
        fake_router.enqueue(
            TaskType.EXTRACT_ENTITY,
            {
                "values": [
                    {
                        "value_text": "12,345",
                        "value_num": 12345,
                        "unit": "kWh",
                        "period_text": "FY 2024-25",
                        "source_excerpt": "Total Electricity Consumption: 12,345 kWh",
                        "model_logprob": 0.93,
                    }
                ]
            },
            prompt_tokens=900,
            completion_tokens=120,
        )

    patch_s3["s3://test-bucket/acme.pdf"] = sample_pdf_bytes
    orch = DocumentOrchestrator()
    req = ExtractRequest(
        file_id="file-1",
        tenant_id="tenant-1",
        s3_url="s3://test-bucket/acme.pdf",
    )
    resp = await orch.extract(req)

    assert resp.status in (ExtractStatus.OK, ExtractStatus.NEEDS_REVIEW, ExtractStatus.PARTIAL)
    assert resp.doc_type_detected == "UTILITY_BILL"
    keys = [f.canonical_key for f in resp.fields]
    assert "electricity_kwh" in keys
    e = next(f for f in resp.fields if f.canonical_key == "electricity_kwh")
    assert e.value_num == 12345.0
    assert e.unit_canonical == "kWh"
    assert e.confidence_composite > 0.0


async def test_orchestrator_unsupported_kind_returns_failed(
    fake_router,
    patch_s3,
    patch_rag,
):
    orch = DocumentOrchestrator()
    patch_s3["s3://b/unknown.bin"] = b"\x00\x01\x02\x03\x04\x05"
    req = ExtractRequest(file_id="f", tenant_id="t", s3_url="s3://b/unknown.bin")
    resp = await orch.extract(req)
    assert resp.status == ExtractStatus.FAILED
    assert any(err.code == "UNSUPPORTED_KIND" for err in resp.errors)


async def test_orchestrator_s3_failure_returns_failed(
    fake_router,
    monkeypatch,
):
    orch = DocumentOrchestrator()

    async def boom(url: str):
        raise RuntimeError("network down")

    monkeypatch.setattr("app.orchestrator.document_orchestrator.download_to_bytes", boom)

    req = ExtractRequest(file_id="f", tenant_id="t", s3_url="s3://b/x.pdf")
    resp = await orch.extract(req)
    assert resp.status == ExtractStatus.FAILED
    assert any(err.code == "S3_DOWNLOAD" for err in resp.errors)
