#!/usr/bin/env python3
"""
Build the price files the Stack page reads.

Pulls S&P 500 constituents from Wikipedia, downloads daily and hourly bars
with yfinance, and writes one compact JSON per ticker plus an index:

    frontend/research/stack/data/index.json     {updated, count, tickers:[{s,f,n,sec}]}
    frontend/research/stack/data/AAPL.json      {s, n, sec, updated, d:{...}, h1:{...}}

Each series is stored column-wise to keep the files small:

    {"tu": 86400000, "t": [...], "o": [...], "h": [...], "l": [...], "c": [...]}

`tu` is the multiplier that turns a `t` value back into milliseconds —
days for the daily series, minutes for the hourly one.

Usage:
    python automation/scripts/fetch_market_data.py --out frontend/research/stack/data
    python automation/scripts/fetch_market_data.py --out frontend/research/stack/data --limit 50 --daily-period 5y
    python automation/scripts/fetch_market_data.py --out frontend/research/stack/data --tickers AAPL MSFT NVDA
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
# Wikipedia answers 403 to the default urllib/pandas agent, so identify the job.
# SITE_URL lets the deployed domain be named without editing this file.
SITE_URL = os.getenv("SITE_URL", "https://github.com/SchwarzRene/bqe-backend")
HEADERS = {"User-Agent": f"bqe market-data (+{SITE_URL})"}
OHLC = ("Open", "High", "Low", "Close")


# --------------------------------------------------------------------------- #
# constituents
# --------------------------------------------------------------------------- #
def yahoo_symbol(sym: str) -> str:
    """BRK.B -> BRK-B (Yahoo's spelling, and our filename)."""
    return sym.strip().upper().replace(".", "-")


def constituents(retries: int = 3) -> list[dict]:
    """Current S&P 500 members. Returns [{s, f, n, sec}]."""
    last: Exception | None = None
    html = None
    for attempt in range(retries):
        try:
            res = requests.get(WIKI_URL, headers=HEADERS, timeout=30)
            res.raise_for_status()
            html = res.text
            break
        except Exception as exc:                           # noqa: BLE001
            last = exc
            wait = 3 * (attempt + 1)
            print(f"  wiki retry {attempt+1}/{retries} after {exc!r} (sleep {wait}s)", file=sys.stderr)
            time.sleep(wait)
    if html is None:
        raise RuntimeError(f"could not read the constituent list: {last!r}")

    tables = pd.read_html(StringIO(html))
    df = next(t for t in tables if "Symbol" in t.columns and "GICS Sector" in t.columns)
    out = []
    for _, row in df.iterrows():
        sym = str(row["Symbol"]).strip().upper()
        if not sym or sym == "NAN":
            continue
        out.append({
            "s": sym,
            "f": yahoo_symbol(sym),
            "n": str(row["Security"]).strip(),
            "sec": str(row["GICS Sector"]).strip(),
        })
    out.sort(key=lambda r: (r["sec"], r["s"]))
    return out


def previous_index(out_dir: Path) -> list[dict]:
    """Fall back to the last index we wrote if Wikipedia is unreachable."""
    path = out_dir / "index.json"
    if path.exists():
        try:
            return json.loads(path.read_text())["tickers"]
        except Exception:
            pass
    return []


# --------------------------------------------------------------------------- #
# download
# --------------------------------------------------------------------------- #
def download(symbols: list[str], period: str, interval: str,
             chunk: int = 40, pause: float = 1.5, retries: int = 3) -> dict[str, pd.DataFrame]:
    """Batched yf.download. Returns {yahoo_symbol: DataFrame}."""
    frames: dict[str, pd.DataFrame] = {}
    for start in range(0, len(symbols), chunk):
        batch = symbols[start:start + chunk]
        df = None
        for attempt in range(retries):
            try:
                df = yf.download(
                    batch, period=period, interval=interval,
                    group_by="ticker", auto_adjust=True, actions=False,
                    threads=True, progress=False,
                )
                break
            except Exception as exc:                      # noqa: BLE001
                wait = 5 * (attempt + 1)
                print(f"  retry {attempt+1}/{retries} after {exc!r} (sleep {wait}s)", file=sys.stderr)
                time.sleep(wait)
        if df is None or df.empty:
            print(f"  no data for batch starting {batch[0]}", file=sys.stderr)
            continue
        for sym in batch:
            try:
                sub = df[sym] if isinstance(df.columns, pd.MultiIndex) else df
            except KeyError:
                continue
            sub = sub.dropna(how="all")
            if len(sub):
                frames[sym] = sub
        done = min(start + chunk, len(symbols))
        print(f"  {interval}: {done}/{len(symbols)}", flush=True)
        time.sleep(pause)
    return frames


# --------------------------------------------------------------------------- #
# encode
# --------------------------------------------------------------------------- #
def encode(df: pd.DataFrame, unit_ms: int) -> dict | None:
    """Column-wise OHLC. unit_ms: 86_400_000 for days, 60_000 for minutes."""
    if df is None or not len(df):
        return None
    cols = {"tu": unit_ms, "t": [], "o": [], "h": [], "l": [], "c": []}
    step = unit_ms // 1000
    for ts, row in df.iterrows():
        try:
            values = [float(row[k]) for k in OHLC]
        except (TypeError, ValueError, KeyError):
            continue
        if any(v != v or v <= 0 for v in values):          # NaN or nonsense
            continue
        stamp = pd.Timestamp(ts)
        stamp = stamp.tz_localize("UTC") if stamp.tzinfo is None else stamp.tz_convert("UTC")
        if unit_ms == 86_400_000:                          # snap to UTC midnight
            stamp = stamp.normalize()
        digits = 4 if values[3] < 10 else 2
        cols["t"].append(int(stamp.timestamp()) // step)
        for key, value in zip(("o", "h", "l", "c"), values):
            cols[key].append(round(value, digits))
    return cols if len(cols["t"]) > 10 else None


def write_ticker(out_dir: Path, meta: dict, daily: dict, hourly: dict | None, stamp: str) -> int:
    payload = {"s": meta["s"], "n": meta["n"], "sec": meta["sec"], "updated": stamp, "d": daily}
    if hourly:
        payload["h1"] = hourly
    text = json.dumps(payload, separators=(",", ":"))
    (out_dir / f"{meta['f']}.json").write_text(text)
    return len(text)


# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="frontend/research/stack/data", help="output folder (default: frontend/research/stack/data)")
    ap.add_argument("--tickers", nargs="*", help="only these symbols, instead of the S&P 500")
    ap.add_argument("--limit", type=int, default=0, help="stop after N symbols (handy for a test run)")
    ap.add_argument("--daily-period", default="10y", help="history for the daily bars (default: 10y)")
    ap.add_argument("--hourly-period", default="60d", help="history for the hourly bars, max 730d (default: 60d)")
    ap.add_argument("--chunk", type=int, default=40, help="symbols per request (default: 40)")
    ap.add_argument("--pause", type=float, default=1.5, help="seconds between requests (default: 1.5)")
    ap.add_argument("--no-hourly", action="store_true", help="skip the hourly pass")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.tickers:
        members = [{"s": t.upper(), "f": yahoo_symbol(t), "n": t.upper(), "sec": "Custom"} for t in args.tickers]
    else:
        try:
            members = constituents()
            print(f"{len(members)} constituents from Wikipedia")
        except Exception as exc:                           # noqa: BLE001
            print(f"Wikipedia lookup failed ({exc!r}); reusing the last index", file=sys.stderr)
            members = previous_index(out_dir)
            if not members:
                return 1
    if args.limit:
        members = members[:args.limit]

    symbols = [m["f"] for m in members]
    print(f"daily bars ({args.daily_period}) for {len(symbols)} symbols")
    daily = download(symbols, args.daily_period, "1d", args.chunk, args.pause)

    hourly: dict[str, pd.DataFrame] = {}
    if not args.no_hourly:
        print(f"hourly bars ({args.hourly_period})")
        hourly = download(symbols, args.hourly_period, "60m", args.chunk, args.pause)

    stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    written, total_bytes, skipped = [], 0, []
    for meta in members:
        d = encode(daily.get(meta["f"]), 86_400_000)
        if not d:
            skipped.append(meta["s"])
            continue
        h1 = encode(hourly.get(meta["f"]), 60_000)
        total_bytes += write_ticker(out_dir, meta, d, h1, stamp)
        written.append(meta)

    if not written:
        print("nothing downloaded — leaving the existing files alone", file=sys.stderr)
        return 1

    (out_dir / "index.json").write_text(json.dumps(
        {"updated": stamp, "count": len(written),
         "tickers": [{"s": m["s"], "f": m["f"], "n": m["n"], "sec": m["sec"]} for m in written]},
        separators=(",", ":")))

    print(f"wrote {len(written)} tickers, {total_bytes/1e6:.1f} MB, into {out_dir}")
    if skipped:
        print(f"no data for {len(skipped)}: {', '.join(skipped[:12])}{' …' if len(skipped) > 12 else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
