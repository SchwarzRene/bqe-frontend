"""GET /api/quotes/{symbol} — live bars for one ticker.

Replaces the Cloudflare Worker the Stack page used to call. The page keeps
its 4-second deadline and its fall-through to the committed snapshot, so a
slow or throttled response here degrades to yesterday's close rather than an
empty chart.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.services import yahoo

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


@router.get("/{symbol}", summary="Daily and hourly bars for one ticker")
async def get_quote(symbol: str, request: Request, response: Response) -> Response:
    settings = get_settings()
    symbol = symbol.upper()

    if not yahoo.is_valid_symbol(symbol):
        return JSONResponse({"error": "bad symbol"}, status_code=400)

    cache = request.app.state.quote_cache
    cached = cache.get(symbol)
    if cached is not None:
        return _payload_response(cached, settings.quote_browser_ttl, cache_status="HIT")

    client: httpx.AsyncClient = request.app.state.http
    try:
        payload = await yahoo.fetch_quote(client, symbol, settings.upstream_base)
    except yahoo.UpstreamError as exc:
        # 502 is what the page treats as "use the snapshot for this ticker".
        log.warning("upstream failed for %s: %s", symbol, exc)
        return JSONResponse({"error": str(exc)[:200]}, status_code=502)
    except httpx.HTTPError as exc:
        log.warning("transport failed for %s: %s", symbol, exc)
        return JSONResponse({"error": "upstream unavailable"}, status_code=502)

    cache.set(symbol, payload)
    return _payload_response(payload, settings.quote_browser_ttl, cache_status="MISS")


def _payload_response(payload: dict, browser_ttl: int, cache_status: str) -> JSONResponse:
    return JSONResponse(
        payload,
        headers={
            "Cache-Control": f"public, max-age={browser_ttl}",
            "X-Cache": cache_status,
        },
    )
