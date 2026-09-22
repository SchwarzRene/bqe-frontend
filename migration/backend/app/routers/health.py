"""Liveness and readiness.

Azure Container Apps probes /healthz to decide whether a revision is
healthy enough to take traffic. It must stay cheap and must not call
Yahoo — an upstream outage should not take this service down with it.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["meta"])


@router.get("/healthz", summary="Liveness probe")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "env": get_settings().env}
