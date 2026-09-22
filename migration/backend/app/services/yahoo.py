"""Yahoo chart client — the server half of the Stack page's live quotes.

Ported from the Cloudflare Worker that used to do this job
(automation/worker/live-quotes.js in the old schwarzrene.github.io repo).

Yahoo's chart endpoint sends no CORS headers, so a browser cannot call it
directly. This module calls it server-side and returns the same column-wise
shape the committed snapshot uses, so a level drawn on one sits at the same
height on the other.

Prices are adjusted by the adjclose ratio to match the snapshot written by
automation/scripts/fetch_market_data.py, which uses yfinance auto_adjust=True.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

log = logging.getLogger(__name__)

# One to ten characters: letters, digits, dot, hyphen. Anything else is not a
# ticker and is rejected before it reaches Yahoo.
SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,9}$")

USER_AGENT = (
    "Mozilla/5.0 (compatible; bqe-backend/1.0; +https://github.com/SchwarzRene/bqe-backend)"
)


@dataclass(frozen=True)
class Series:
    """One Yahoo range, described the way the page wants to read it."""

    range: str
    interval: str
    unit_ms: int  # multiplier that turns a stored `t` value back into milliseconds


DAILY = Series(range="10y", interval="1d", unit_ms=86_400_000)
HOURLY = Series(range="60d", interval="60m", unit_ms=60_000)

# Below this many daily bars the card has nothing worth drawing.
MIN_DAILY_BARS = 40
MIN_HOURLY_BARS = 20


class UpstreamError(RuntimeError):
    """Yahoo refused, timed out, or answered with something unusable."""


def is_valid_symbol(symbol: str) -> bool:
    return bool(SYMBOL_RE.match(symbol))


async def fetch_quote(client: httpx.AsyncClient, symbol: str, base_url: str) -> dict[str, Any]:
    """Daily bars, plus hourly when Yahoo offers them.

    The hourly series is a bonus: if it fails the daily series is still
    returned, because the chart is drawn from the daily bars.
    """
    daily_task = _chart(client, symbol, DAILY, base_url)
    hourly_task = _chart(client, symbol, HOURLY, base_url)

    daily, hourly = await asyncio.gather(daily_task, hourly_task, return_exceptions=True)

    if isinstance(daily, BaseException):
        raise UpstreamError(str(daily)) from daily
    if daily is None or len(daily["t"]) < MIN_DAILY_BARS:
        raise UpstreamError("no data")

    payload: dict[str, Any] = {
        "s": symbol,
        "updated": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "live": True,
        "d": daily,
    }

    if isinstance(hourly, BaseException):
        log.info("hourly series unavailable for %s: %s", symbol, hourly)
    elif hourly is not None and len(hourly["t"]) > MIN_HOURLY_BARS:
        payload["h1"] = hourly

    return payload


async def _chart(
    client: httpx.AsyncClient, symbol: str, spec: Series, base_url: str
) -> dict[str, Any] | None:
    """One Yahoo range, returned in the page's column format."""
    url = f"{base_url.rstrip('/')}/v8/finance/chart/{symbol}"
    params = {"range": spec.range, "interval": spec.interval, "includePrePost": "false"}

    response = await client.get(url, params=params, headers={"User-Agent": USER_AGENT})
    if response.status_code != 200:
        raise UpstreamError(f"yahoo {response.status_code}")

    body = response.json()
    result = (((body or {}).get("chart") or {}).get("result") or [None])[0]
    if not result or not isinstance(result.get("timestamp"), list):
        return None

    indicators = result.get("indicators") or {}
    quote = (indicators.get("quote") or [{}])[0] or {}
    adjclose = ((indicators.get("adjclose") or [{}])[0] or {}).get("adjclose") or []

    opens, highs, lows, closes = (
        quote.get("open") or [],
        quote.get("high") or [],
        quote.get("low") or [],
        quote.get("close") or [],
    )

    step = spec.unit_ms // 1000
    out: dict[str, Any] = {"tu": spec.unit_ms, "t": [], "o": [], "h": [], "l": [], "c": []}

    for i, stamp in enumerate(result["timestamp"]):
        o, h, low, c = (
            _at(opens, i),
            _at(highs, i),
            _at(lows, i),
            _at(closes, i),
        )
        if any(v is None or not v > 0 for v in (o, h, low, c)):
            continue

        # Match the snapshot's auto_adjust=True: scale OHLC by adjclose/close.
        adj = _at(adjclose, i)
        k = adj / c if adj is not None and c > 0 else 1.0
        digits = 4 if c * k < 10 else 2

        out["t"].append(stamp // step)
        out["o"].append(round(o * k, digits))
        out["h"].append(round(h * k, digits))
        out["l"].append(round(low * k, digits))
        out["c"].append(round(c * k, digits))

    return out


def _at(values: list[Any], index: int) -> float | None:
    """Yahoo pads its arrays with nulls and sometimes ends them early."""
    if index >= len(values):
        return None
    value = values[index]
    return None if value is None else float(value)
