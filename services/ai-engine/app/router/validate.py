"""POST /validate — re-score fields with historical context."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.agents.validation_agent import ValidationAgent
from app.models.requests import ValidateFieldsRequest
from app.models.responses import ExtractedField, ValidateResponse
from app.utils.logging import get_logger

logger = get_logger("router.validate")
router = APIRouter(tags=["validate"])

_agent: ValidationAgent | None = None


def _get_agent() -> ValidationAgent:
    global _agent
    if _agent is None:
        _agent = ValidationAgent()
    return _agent


@router.post("/validate", response_model=ValidateResponse)
async def validate_endpoint(req: ValidateFieldsRequest) -> ValidateResponse:
    agent = _get_agent()
    try:
        fields: list[ExtractedField] = [ExtractedField.model_validate(f) for f in req.fields]
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"invalid field payload: {e}") from e
    return await agent.validate(
        tenant_id=req.tenant_id,
        fields=fields,
        historical=req.historical,
        industry_sector=req.industry_sector,
        organisation_size=req.organization_size,
    )
