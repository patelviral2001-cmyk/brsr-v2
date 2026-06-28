"""Inbound request models."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ExtractRequest(BaseModel):
    """Backend → AI engine extraction request.

    `callback_url` makes the call asynchronous — engine returns 202 and POSTs
    the result later. Without it the call is synchronous.
    """

    model_config = ConfigDict(extra="forbid")

    file_id: str = Field(..., description="Backend's file row id (UUID string)")
    tenant_id: str = Field(..., description="Tenant UUID for isolation")
    s3_url: str = Field(..., description="s3://bucket/key or presigned URL")
    doc_type_hint: Optional[str] = Field(
        None, description="Optional hint from the uploader (overrides classifier confidence floor)"
    )
    callback_url: Optional[HttpUrl] = Field(
        None, description="If set, results are POSTed here instead of returned inline"
    )
    callback_secret_header: Optional[str] = Field(
        None, description="Header name backend will use to validate the callback"
    )
    reporting_period_hint: Optional[str] = Field(
        None, description="e.g. 'FY2024-25' — used to bias period extraction"
    )
    industry_sector: Optional[str] = Field(None, description="GICS-style sector for validation context")
    locale: str = Field("en-IN", description="Language/locale for OCR")


class ClassifyRequest(BaseModel):
    """Cheap classification-only request (no extraction)."""

    model_config = ConfigDict(extra="forbid")

    file_id: str
    tenant_id: str
    s3_url: str


class ValidateFieldsRequest(BaseModel):
    """Validation request — fields + historical context."""

    model_config = ConfigDict(extra="forbid")

    tenant_id: str
    industry_sector: Optional[str] = None
    organization_size: Optional[str] = Field(None, description="small/medium/large")
    fields: list[dict] = Field(default_factory=list)
    historical: dict[str, list[dict]] = Field(
        default_factory=dict,
        description="canonical_key -> [{period_start, period_end, value_num}]",
    )


class FeedbackRequest(BaseModel):
    """HITL feedback from backend."""

    model_config = ConfigDict(extra="forbid")

    field_id: str
    tenant_id: str
    canonical_key: str
    ai_value: Optional[str] = None
    ai_value_num: Optional[float] = None
    corrected_value: Optional[str] = None
    corrected_value_num: Optional[float] = None
    reason: Optional[str] = None
    document_id: Optional[str] = None
    source_page: Optional[int] = None
    prompt_version: Optional[str] = None
    model_used: Optional[str] = None
