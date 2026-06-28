"""POST /feedback — HITL corrections from the backend.

Stores each correction to a Redis stream `feedback:hitl` for later batch
fine-tuning. Also logs to Langfuse as a labelled trace so prompt-version
regressions are visible.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings
from app.models.requests import FeedbackRequest
from app.utils.logging import get_logger

logger = get_logger("router.feedback")
router = APIRouter(tags=["feedback"])


@router.post("/feedback")
async def post_feedback(req: FeedbackRequest, request: Request) -> dict[str, Any]:
    redis = getattr(request.app.state, "redis", None)
    payload = req.model_dump()
    payload["received_at"] = datetime.utcnow().isoformat() + "Z"

    if redis is None:
        logger.warning("feedback.no_redis_dropping", payload=payload)
        raise HTTPException(status_code=503, detail="redis unavailable")

    try:
        message_id = await redis.xadd(
            "feedback:hitl",
            {k: json.dumps(v, default=str) if not isinstance(v, str) else v for k, v in payload.items()},
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("feedback.redis_xadd_failed", err=str(e))
        raise HTTPException(status_code=502, detail=f"queue write failed: {e}") from e

    # Best-effort Langfuse log.
    try:
        s = get_settings()
        if s.LANGFUSE_PUBLIC_KEY and s.LANGFUSE_SECRET_KEY:
            from langfuse import Langfuse  # type: ignore[import-not-found]

            lf = Langfuse(
                public_key=s.LANGFUSE_PUBLIC_KEY,
                secret_key=s.LANGFUSE_SECRET_KEY,
                host=s.LANGFUSE_HOST,
            )
            lf.trace(
                name="hitl.feedback",
                metadata=payload,
                tags=["feedback", "hitl", req.canonical_key],
            )
    except Exception:  # noqa: BLE001
        pass

    logger.info(
        "feedback.received",
        field_id=req.field_id,
        canonical_key=req.canonical_key,
        message_id=message_id,
    )
    return {"accepted": True, "message_id": message_id}
