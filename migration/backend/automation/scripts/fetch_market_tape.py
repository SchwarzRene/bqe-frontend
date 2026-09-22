#!/usr/bin/env python3
"""
Build the rundown the Market Tape page reads.

Asks Claude, with the web-search tool, for the Federal Reserve calendar and for
confirmed earnings dates, then for the reported numbers of anything that has
already started. Everything is written as static JSON next to the page:

    frontend/research/markettape/data/schedule.json   {updated, watchlist, events:[...]}
    frontend/research/markettape/data/results.json    {updated, results:{event_id: {...}}}

The page itself makes no API calls — it renders these files and computes the
live windows and countdowns in the browser.

Usage:
    python automation/scripts/fetch_market_tape.py --out frontend/research/markettape/data
    python automation/scripts/fetch_market_tape.py --out /tmp/tape --tickers NVDA AAPL --no-results
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import anthropic

MODEL = "claude-opus-5"
SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search"}
ET = ZoneInfo("America/New_York")
DEFAULT_WATCHLIST = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL"]

# How long after its start an event is still treated as "on air", per class.
# Mirrors LIVE_WINDOW_MIN in the page.
LIVE_WINDOW_MIN = {"fed": 95, "earnings": 80}


# --------------------------------------------------------------------------- #
# talking to the model
# --------------------------------------------------------------------------- #
def extract_json(raw: str):
    """First balanced JSON array/object in a blob; salvages a truncated array."""
    if not raw:
        return None
    text = raw.replace("```json", "").replace("```", "").strip()
    start = min((i for i in (text.find("["), text.find("{")) if i >= 0), default=-1)
    if start < 0:
        return None
    text = text[start:]
    opener = text[0]
    depth = in_str = esc = 0
    end = last_item = -1
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = 0
            elif ch == "\\":
                esc = 1
            elif ch == '"':
                in_str = 0
            continue
        if ch == '"':
            in_str = 1
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 1 and opener == "[":
                last_item = i
            if depth == 0:
                end = i
                break
    for candidate in ([text[:end + 1]] if end > 0 else []) + (
            [text[:last_item + 1] + "]"] if opener == "[" and last_item > 0 else []):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


def ask(client: anthropic.Anthropic, prompt: str, max_tokens: int = 4000):
    """One search-grounded call that must come back as JSON."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        tools=[SEARCH_TOOL],
        messages=[{"role": "user", "content": prompt}],
    )
    if response.stop_reason == "refusal":
        print(f"  refused: {response.stop_details}", file=sys.stderr)
        return None
    text = "\n".join(b.text for b in response.content if b.type == "text")
    return extract_json(text)


# --------------------------------------------------------------------------- #
# prompts
# --------------------------------------------------------------------------- #
def fed_prompt(today: str) -> str:
    return f"""Today is {today} (New York time). Search the web for scheduled Federal Reserve public events from {today} through the next 10 days: FOMC decisions, the Chair's press conferences, congressional testimony, and speeches by the Chair, governors, or regional Fed presidents.

Return ONLY a compact JSON array, no prose, no markdown fences. Up to 6 items, sorted earliest first:
[{{"id":"short-slug","kind":"fed","title":"FOMC rate decision","org":"Federal Reserve","date":"YYYY-MM-DD","timeET":"14:00","streamUrl":"https://...","streamSource":"federalreserve.gov","streamKind":"video","note":"under 10 words: what to watch","links":[{{"label":"Calendar","url":"https://..."}}]}}]

Rules: timeET is 24-hour New York time. streamKind is "video" if it is a watchable broadcast, "audio" if listen-only, "page" if the link is just a calendar or document page. streamUrl and every link URL must be a real URL you saw in the search results (prefer federalreserve.gov live pages or an official YouTube live URL). Never invent a URL. Up to 3 links per event."""


def earnings_prompt(today: str, tickers: list[str]) -> str:
    return f"""Today is {today} (New York time). Search the web for confirmed earnings dates for these tickers in the next 21 days: {", ".join(tickers)}.

Return ONLY a compact JSON array, no prose, no markdown fences. Up to 8 items, sorted earliest first, skip any ticker with no scheduled date:
[{{"id":"short-slug","kind":"earnings","title":"Q3 FY26 results","org":"Company name","ticker":"XXXX","date":"YYYY-MM-DD","releaseET":"16:30","timeET":"17:00","streamUrl":"https://...","streamSource":"apple.com/investor","streamKind":"audio","note":"under 10 words: the number that matters","links":[{{"label":"Webcast","url":"https://..."}}]}}]

Rules: releaseET is when the numbers hit the wire, timeET is when the call starts, both 24-hour New York time. streamKind is "video" only if there is a real video broadcast, "audio" for a listen-only webcast (most earnings calls), "page" if you only found an IR landing page. streamUrl and every link URL must be the company's own pages from the search results, not a third-party site. Never invent a URL. If the date is estimated rather than confirmed, start the note with "Est:"."""


def result_prompt(event: dict, today: str) -> str:
    if event.get("kind") == "earnings":
        who = f'{event.get("org") or event.get("ticker")} ({event.get("ticker")}) earnings scheduled {event["date"]}'
        shape = '"metrics":[{"label":"Adj. EPS","actual":"$1.42","estimate":"$1.28","verdict":"beat"}]  (up to 4: EPS, revenue, a segment or margin, guidance)'
    else:
        who = f'the Federal Reserve event "{event["title"]}" scheduled {event["date"]}'
        shape = '"metrics":[{"label":"Target range","actual":"3.50-3.75%","estimate":"unchanged","verdict":"inline"}]  (up to 4: rate, vote split, dot-plot median, balance sheet)'
    return f"""Today is {today} (New York time). Search the web for the outcome of {who}.

Return ONLY compact JSON, no prose, no markdown fences:
{{"status":"reported","headline":"one sentence, under 20 words","metrics":[...],"bullets":["under 15 words each, max 3"],"reaction":"price reaction in one short sentence, or empty string","asOf":"YYYY-MM-DD HH:MM ET"}}

Where {shape}
verdict is "beat", "miss", or "inline". Use "not_yet" for status if it has not happened or nothing has been published, and leave metrics empty. Write every field in your own words — do not quote source text."""


# --------------------------------------------------------------------------- #
# shaping
# --------------------------------------------------------------------------- #
def clean_links(raw) -> list[dict]:
    out = []
    for link in raw if isinstance(raw, list) else []:
        if isinstance(link, dict) and str(link.get("url", "")).startswith(("http://", "https://")):
            out.append({"label": str(link.get("label") or "Link")[:60], "url": link["url"]})
    return out[:4]


def clean_event(raw, kind: str, index: int) -> dict | None:
    """Keep only rows the page can actually place on a clock."""
    if not isinstance(raw, dict) or not raw.get("date") or not raw.get("title"):
        return None
    try:
        datetime.strptime(str(raw["date"]), "%Y-%m-%d")
    except ValueError:
        return None
    event = {
        "id": str(raw.get("id") or f"{kind}-{index}")[:80],
        "kind": kind,
        "title": str(raw["title"])[:120],
        "org": str(raw.get("org") or "")[:120],
        "date": str(raw["date"]),
        "timeET": str(raw.get("timeET") or "09:00")[:5],
        "note": str(raw.get("note") or "")[:120],
        "streamUrl": raw.get("streamUrl") if str(raw.get("streamUrl", "")).startswith("http") else "",
        "streamSource": str(raw.get("streamSource") or "")[:80],
        "streamKind": raw.get("streamKind") if raw.get("streamKind") in ("video", "audio", "page") else "page",
        "links": clean_links(raw.get("links")),
    }
    if kind == "earnings":
        event["ticker"] = str(raw.get("ticker") or "")[:8].upper()
        if raw.get("releaseET"):
            event["releaseET"] = str(raw["releaseET"])[:5]
    return event


def started(event: dict, now: datetime) -> bool:
    """True once the wire time (or the call, if that is all we have) has passed."""
    clock = event.get("releaseET") or event.get("timeET") or "09:00"
    try:
        hour, minute = (int(part) for part in clock.split(":")[:2])
        start = datetime.strptime(event["date"], "%Y-%m-%d").replace(
            hour=hour, minute=minute, tzinfo=ET)
    except (ValueError, TypeError):
        return False
    window = timedelta(minutes=LIVE_WINDOW_MIN.get(event["kind"], 90) + 24 * 60)
    return start <= now <= start + window


# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="frontend/research/markettape/data", help="output folder")
    ap.add_argument("--tickers", nargs="*", default=DEFAULT_WATCHLIST, help="earnings watchlist")
    ap.add_argument("--no-results", action="store_true", help="skip the results pass")
    ap.add_argument("--max-results", type=int, default=6, help="most events to price out in one run")
    args = ap.parse_args()

    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        print("No ANTHROPIC_API_KEY in the environment. Add it as a repository secret "
              "(Settings -> Secrets and variables -> Actions) and run this workflow again.",
              file=sys.stderr)
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    client = anthropic.Anthropic()
    now = datetime.now(ET)
    today = now.strftime("%Y-%m-%d")

    events: list[dict] = []
    for kind, prompt in (("fed", fed_prompt(today)),
                         ("earnings", earnings_prompt(today, args.tickers))):
        print(f"{kind}: searching…", flush=True)
        rows = ask(client, prompt)
        if not isinstance(rows, list):
            print(f"  {kind} lookup came back unusable", file=sys.stderr)
            continue
        for i, row in enumerate(rows):
            event = clean_event(row, kind, i)
            if event:
                events.append(event)
        print(f"  {kind}: {len(rows)} returned")

    if not events:
        print("nothing usable came back — leaving the existing files alone", file=sys.stderr)
        return 1

    events.sort(key=lambda e: (e["date"], e.get("releaseET") or e["timeET"]))
    stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    (out_dir / "schedule.json").write_text(json.dumps(
        {"updated": stamp, "watchlist": args.tickers, "events": events},
        separators=(",", ":")))
    print(f"wrote {len(events)} events")

    if args.no_results:
        return 0

    # Only events that have already started can have numbers attached.
    due = [e for e in events if started(e, now)][:args.max_results]
    results: dict[str, dict] = {}
    previous = out_dir / "results.json"
    if previous.exists():
        try:
            results = json.loads(previous.read_text()).get("results", {})
        except (json.JSONDecodeError, OSError):
            results = {}

    for event in due:
        print(f"result: {event['id']}", flush=True)
        data = ask(client, result_prompt(event, today), max_tokens=2000)
        if isinstance(data, dict) and data.get("status") in ("reported", "not_yet"):
            results[event["id"]] = data

    live_ids = {e["id"] for e in events}
    results = {k: v for k, v in results.items() if k in live_ids}
    (out_dir / "results.json").write_text(json.dumps(
        {"updated": stamp, "results": results}, separators=(",", ":")))
    print(f"wrote {len(results)} results")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
