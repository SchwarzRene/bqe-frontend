"""BQE backend — FastAPI application factory and process lifecycle.

Run locally:      uvicorn app.main:app --reload --port 8080
Run in a container: see the Dockerfile (gunicorn + uvicorn workers)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import health, quotes
from app.services.cache import TTLCache


@asynccontextmanager
async def lifespan(app: FastAPI):
    """One HTTP client and one cache for the life of the process.

    A new httpx.AsyncClient per request would open a new TCP and TLS
    connection to Yahoo every time, which is both slow and a good way to get
    rate-limited. This keeps the pool warm.
    """
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)-8s %(name)s %(message)s",
    )

    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.upstream_timeout),
        limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
        follow_redirects=True,
    )
    app.state.quote_cache = TTLCache(ttl=settings.quote_cache_ttl)

    logging.getLogger(__name__).info(
        "backend up: env=%s origins=%s", settings.env, settings.allowed_origins
    )
    try:
        yield
    finally:
        await app.state.http.aclose()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="BQE backend",
        version="1.0.0",
        summary="Market data services for the BQE site.",
        lifespan=lifespan,
        # The interactive docs are useful in development and noise in
        # production, where they only advertise the surface area.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=settings.allowed_origin_regex or None,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        max_age=600,
    )

    app.include_router(health.router)
    app.include_router(quotes.router)

    return app


app = create_app()
