"""A tiny in-process TTL cache.

The Cloudflare Worker this service replaces used `caches.default`, which is
shared across the edge. In a container there is no such thing, so each
replica keeps its own copy. That is fine for quote data: the worst case is
one upstream call per replica per TTL window, and the app runs at one or two
replicas.

If a shared cache is ever needed (many replicas, or a stricter upstream rate
limit), swap this for Redis behind the same get/set interface.
"""

from __future__ import annotations

import threading
import time
from typing import Any


class TTLCache:
    def __init__(self, ttl: float, max_entries: int = 2048) -> None:
        self._ttl = ttl
        self._max_entries = max_entries
        self._lock = threading.Lock()
        self._entries: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at <= now:
                # Expired: drop it so the dict does not grow with dead keys.
                self._entries.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._entries) >= self._max_entries:
                self._evict_expired(now)
                if len(self._entries) >= self._max_entries:
                    # Still full of live entries; drop the nearest to expiry.
                    oldest = min(self._entries, key=lambda k: self._entries[k][0])
                    self._entries.pop(oldest, None)
            self._entries[key] = (now + self._ttl, value)

    def _evict_expired(self, now: float) -> None:
        dead = [k for k, (expires_at, _) in self._entries.items() if expires_at <= now]
        for key in dead:
            self._entries.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
