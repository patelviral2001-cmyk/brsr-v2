"""
Document embedding endpoint.

Called by the AI extraction engine (services/ai-engine) after a document is
extracted. We chunk it semantically, embed it, and upsert into the per-tenant
Qdrant collection so the Copilot can later retrieve it.
"""
from __future__ import annotations

import uuid
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import Principal, require_principal
from app.rag.chunker import SemanticChunker
from app.rag.vector_store import get_vector_store
from app.safety.pii_redactor import PIIRedactor

log = structlog.get_logger("copilot.router.embed")
router = APIRouter()


class EmbedDocumentRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    document_type: Literal[
        "policy",
        "report",
        "evidence",
        "framework_reference",
        "extraction_output",
        "calculation_log",
    ]
    title: str = Field(..., min_length=1, max_length=500)
    text: str = Field(..., min_length=1, max_length=2_000_000)
    fiscal_year: str | None = Field(default=None, pattern=r"^FY\d{2}-\d{2}$")
    framework: str | None = None
    section_id: str | None = None
    canonical_keys: list[str] = Field(default_factory=list)
    # Provenance — where the source lived; used to render citation chips.
    source_uri: str | None = None
    source_page_start: int | None = None
    source_page_end: int | None = None


class EmbedDocumentResponse(BaseModel):
    document_id: str
    chunks_indexed: int
    request_id: str


@router.post(
    "/document",
    response_model=EmbedDocumentResponse,
    summary="Index a document for RAG retrieval",
)
async def embed_document(
    body: EmbedDocumentRequest,
    principal: Principal = Depends(require_principal),
) -> EmbedDocumentResponse:
    request_id = str(uuid.uuid4())
    log.info(
        "embed_document.start",
        document_id=body.document_id,
        document_type=body.document_type,
        chars=len(body.text),
    )

    redactor = PIIRedactor()
    safe_text, redactions = redactor.redact(body.text)
    if redactions:
        log.info("embed_document.redactions", count=len(redactions))

    chunker = SemanticChunker(target_tokens=400, overlap_tokens=50)
    chunks = chunker.chunk(safe_text)
    if not chunks:
        raise HTTPException(400, "Document produced zero chunks after redaction")

    store = get_vector_store()
    payloads = []
    for idx, chunk in enumerate(chunks):
        payloads.append(
            {
                "id": f"{body.document_id}:{idx}",
                "text": chunk.text,
                "metadata": {
                    "tenant_id": principal.tenant_id,
                    "document_id": body.document_id,
                    "document_type": body.document_type,
                    "title": body.title,
                    "chunk_index": idx,
                    "char_start": chunk.char_start,
                    "char_end": chunk.char_end,
                    "fiscal_year": body.fiscal_year,
                    "framework": body.framework,
                    "section_id": body.section_id,
                    "canonical_keys": body.canonical_keys,
                    "source_uri": body.source_uri,
                    "source_page_start": body.source_page_start,
                    "source_page_end": body.source_page_end,
                },
            }
        )

    await store.upsert(tenant_id=principal.tenant_id, points=payloads)

    log.info(
        "embed_document.done",
        document_id=body.document_id,
        chunks=len(chunks),
        request_id=request_id,
    )
    return EmbedDocumentResponse(
        document_id=body.document_id,
        chunks_indexed=len(chunks),
        request_id=request_id,
    )
