"""The quotes endpoint, with Yahoo mocked by respx.

These tests are the reason the Worker port can be trusted: they pin the
adjclose scaling and the column layout that the Stack page's chart code
reads, so a refactor that quietly changes either one fails here.
"""

from __future__ import annotations

import httpx
import pytest
import respx

CHART_PATH_RE = r"https://yahoo\.test/v8/finance/chart/.*"


def chart_body(n: int = 60, close: float = 100.0, adj_ratio: float = 1.0) -> dict:
    """A Yahoo chart response with n usable bars."""
    closes = [close] * n
    return {
        "chart": {
            "result": [
                {
                    "timestamp": [86_400 * (i + 1) for i in range(n)],
                    "indicators": {
                        "quote": [
                            {
                                "open": [close] * n,
                                "high": [close * 1.02] * n,
                                "low": [close * 0.98] * n,
                                "close": closes,
                            }
                        ],
                        "adjclose": [{"adjclose": [c * adj_ratio for c in closes]}],
                    },
                }
            ]
        }
    }


@respx.mock
def test_returns_column_wise_series(client):
    respx.get(url__regex=CHART_PATH_RE).mock(
        return_value=httpx.Response(200, json=chart_body(n=60))
    )

    response = client.get("/api/quotes/AAPL")

    assert response.status_code == 200
    body = response.json()
    assert body["s"] == "AAPL"
    assert body["live"] is True
    daily = body["d"]
    assert daily["tu"] == 86_400_000
    # Every column is the same length, or the chart code reads past the end.
    lengths = {len(daily[k]) for k in ("t", "o", "h", "l", "c")}
    assert lengths == {60}


@respx.mock
def test_prices_are_adjusted_by_the_adjclose_ratio(client):
    # adjclose at half of close means a 0.5 factor on every OHLC value,
    # which is what keeps the live series aligned with the committed
    # snapshot that yfinance wrote with auto_adjust=True.
    respx.get(url__regex=CHART_PATH_RE).mock(
        return_value=httpx.Response(200, json=chart_body(n=60, close=100.0, adj_ratio=0.5))
    )

    body = client.get("/api/quotes/MSFT").json()

    assert body["d"]["c"][0] == pytest.approx(50.0)
    assert body["d"]["o"][0] == pytest.approx(50.0)
    assert body["d"]["h"][0] == pytest.approx(51.0)


@respx.mock
def test_sub_ten_dollar_prices_keep_four_decimals(client):
    respx.get(url__regex=CHART_PATH_RE).mock(
        return_value=httpx.Response(200, json=chart_body(n=60, close=1.23456))
    )

    close = client.get("/api/quotes/PENNY").json()["d"]["c"][0]

    assert close == pytest.approx(1.2346)


@pytest.mark.parametrize("symbol", ["../etc/passwd", "TOOLONGSYMBOL", "A B", "-BAD"])
def test_rejects_symbols_that_are_not_tickers(client, symbol):
    response = client.get(f"/api/quotes/{symbol}")
    assert response.status_code in (400, 404)


@respx.mock
def test_thin_series_is_an_upstream_error(client):
    # Fewer than 40 daily bars is not enough to draw, so the page should be
    # told to fall back to the snapshot rather than shown a stub chart.
    respx.get(url__regex=CHART_PATH_RE).mock(return_value=httpx.Response(200, json=chart_body(n=5)))

    response = client.get("/api/quotes/THIN")

    assert response.status_code == 502


@respx.mock
def test_upstream_failure_becomes_502(client):
    respx.get(url__regex=CHART_PATH_RE).mock(return_value=httpx.Response(429))

    response = client.get("/api/quotes/RATED")

    assert response.status_code == 502
    assert "error" in response.json()


@respx.mock
def test_second_call_is_served_from_cache(client):
    route = respx.get(url__regex=CHART_PATH_RE).mock(
        return_value=httpx.Response(200, json=chart_body(n=60))
    )

    first = client.get("/api/quotes/CACHED")
    second = client.get("/api/quotes/CACHED")

    assert first.headers["X-Cache"] == "MISS"
    assert second.headers["X-Cache"] == "HIT"
    # Two ranges on the miss (daily + hourly), nothing more on the hit.
    assert route.call_count == 2


@respx.mock
def test_cors_header_is_returned_for_an_allowed_origin(client):
    respx.get(url__regex=CHART_PATH_RE).mock(
        return_value=httpx.Response(200, json=chart_body(n=60))
    )

    response = client.get("/api/quotes/CORS", headers={"Origin": "https://bqe.example"})

    assert response.headers["access-control-allow-origin"] == "https://bqe.example"
