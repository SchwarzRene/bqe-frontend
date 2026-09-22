from __future__ import annotations

import os

import pytest

# Settings are read once at import and cached, so the environment has to be
# arranged before app.config is first touched.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("ALLOWED_ORIGINS", "https://bqe.example,http://localhost:8000")
os.environ.setdefault("YAHOO_BASE", "https://yahoo.test")
os.environ.setdefault("QUOTE_CACHE_TTL", "60")


@pytest.fixture()
def client():
    """A TestClient that runs the real lifespan, so state.http exists."""
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c
