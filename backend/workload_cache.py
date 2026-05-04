"""
In-memory cache for global workload data (assignee → open tasks).

This avoids hitting the Jira API on every recommendation request.
The cache is invalidated after each sync and expires after a configurable TTL.

Memory footprint: ~1.9 MB for 30,000 issues (negligible).
"""
import time
import threading
import logging

logger = logging.getLogger(__name__)


class WorkloadCache:
    """Thread-safe in-memory cache for global workload data with configurable TTL."""

    def __init__(self, ttl_seconds: int = 600):  # 10 minutes default
        self._data: dict = {}        # user_id -> [{"story_points": float, "issue_key": str}]
        self._timestamp: float = 0
        self._ttl: int = ttl_seconds
        self._lock = threading.Lock()

    @property
    def is_stale(self) -> bool:
        return (time.time() - self._timestamp) > self._ttl

    def get(self) -> dict | None:
        """Return cached workload data, or None if stale/empty."""
        with self._lock:
            if self.is_stale:
                return None
            return self._data

    def set(self, data: dict):
        """Store workload data and reset the TTL clock."""
        with self._lock:
            self._data = data
            self._timestamp = time.time()
            logger.info(f"[WORKLOAD CACHE] Stored workload for {len(data)} users. TTL={self._ttl}s.")

    def invalidate(self):
        """Force the cache to expire so the next request triggers a fresh fetch."""
        with self._lock:
            self._timestamp = 0
            logger.info("[WORKLOAD CACHE] Invalidated.")


# Module-level singleton — shared across all request threads
workload_cache = WorkloadCache(ttl_seconds=600)
