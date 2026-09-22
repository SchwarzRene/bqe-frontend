"""Runtime configuration, read from the environment.

Nothing here has a secret default. Every value either has a harmless
public default (origins, TTLs) or is required and must be supplied by the
platform: GitHub Actions secrets in CI, Container App secrets in Azure, a
local .env file on a developer machine. See docs/SECRETS.md.
"""

from __future__ import annotations

import os
from functools import lru_cache


def _csv(name: str, default: str) -> list[str]:
    """A comma-separated environment variable, trimmed and de-blanked."""
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


class Settings:
    """Read once at import; the process is restarted to pick up changes."""

    def __init__(self) -> None:
        self.env: str = os.getenv("APP_ENV", "development")

        # Who may call this API from a browser. The Cloudflare Pages
        # production domain, its *.pages.dev preview domains and localhost.
        self.allowed_origins: list[str] = _csv(
            "ALLOWED_ORIGINS",
            "https://schwarzrene.github.io,http://localhost:8000,http://127.0.0.1:8000",
        )
        # Preview deployments get a fresh subdomain per commit, so they are
        # matched by pattern rather than listed one by one.
        self.allowed_origin_regex: str = os.getenv(
            "ALLOWED_ORIGIN_REGEX", r"https://[a-z0-9-]+\.bqe-frontend\.pages\.dev"
        )

        self.upstream_base: str = os.getenv("YAHOO_BASE", "https://query1.finance.yahoo.com")
        self.quote_cache_ttl: int = _int("QUOTE_CACHE_TTL", 60)  # seconds held in-process
        self.quote_browser_ttl: int = _int("QUOTE_BROWSER_TTL", 45)  # seconds the browser may reuse
        self.upstream_timeout: float = float(os.getenv("UPSTREAM_TIMEOUT", "8"))

        self.log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
