"""Unified Redis client wrapper with automatic FakeRedis fallback.

Provides sliding-window rate limiting, JWT JTI & token-family revocation,
crowd-sourced coupon success tracking, FX rate caching, and low-latency
(<50ms) buyer profile caching.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

import fakeredis
import redis

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Seeded realistic defaults for coupon crowd scores: (total_votes, success_votes)
# Rates: WELCOME10=0.92, SAVE15=0.88, ASOS20=0.84, HTZ12=0.95,
#        HEVER15=0.94, FLYCARD10=0.91, MAX8=0.89, BROKEN50=0.18
SEED_COUPON_CROWD_DEFAULTS: dict[str, tuple[int, int]] = {
    "WELCOME10": (50, 46),
    "SAVE15": (50, 44),
    "ASOS20": (50, 42),
    "HTZ12": (40, 38),
    "HEVER15": (50, 47),
    "FLYCARD10": (100, 91),
    "MAX8": (100, 89),
    "BROKEN50": (50, 9),
}

DEFAULT_FX_RATES: dict[tuple[str, str], float] = {
    ("USD", "ILS"): settings.DEFAULT_USD_TO_ILS,
    ("EUR", "ILS"): settings.DEFAULT_EUR_TO_ILS,
    ("ILS", "USD"): round(1.0 / settings.DEFAULT_USD_TO_ILS, 6),
    ("ILS", "EUR"): round(1.0 / settings.DEFAULT_EUR_TO_ILS, 6),
    ("EUR", "USD"): round(settings.DEFAULT_EUR_TO_ILS / settings.DEFAULT_USD_TO_ILS, 6),
    ("USD", "EUR"): round(settings.DEFAULT_USD_TO_ILS / settings.DEFAULT_EUR_TO_ILS, 6),
}

TIER_RATE_LIMITS: dict[str, tuple[int | None, int]] = {
    "FREE": (10, 86400),   # 10 requests / 24 hours
    "PRO": (60, 3600),     # 60 requests / 1 hour
    "ADMIN": (None, 0),    # Unlimited
}


class RedisClientManager:
    """Thread-safe lazy Redis wrapper falling back to FakeStrictRedis when offline."""

    def __init__(self) -> None:
        self._client: Any | None = None
        self._fake_client: fakeredis.FakeStrictRedis | None = None
        self._is_fake: bool = False

    def _get_fake(self) -> fakeredis.FakeStrictRedis:
        if self._fake_client is None:
            self._fake_client = fakeredis.FakeStrictRedis(decode_responses=True)
        return self._fake_client

    def get_client(self) -> Any:
        """Return active Redis client, falling back to FakeStrictRedis if unreachable."""
        if self._client is not None:
            return self._client

        try:
            client = redis.Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
            client.ping()
            self._client = client
            self._is_fake = False
            logger.info("Connected to live Redis at %s", settings.REDIS_URL)
        except Exception as exc:
            logger.warning(
                "Redis unreachable (%s); falling back to FakeStrictRedis.", exc
            )
            self._client = self._get_fake()
            self._is_fake = True

        return self._client

    def reset_connection(self) -> None:
        """Reset cached client reference (useful in tests or reconnects)."""
        self._client = None

    @property
    def is_fake(self) -> bool:
        self.get_client()
        return self._is_fake

    def ping(self) -> bool:
        """Check Redis availability, falling back gracefully on error."""
        try:
            return bool(self.get_client().ping())
        except Exception:
            self._client = self._get_fake()
            self._is_fake = True
            return bool(self._client.ping())

    def execute_with_fallback(self, fn):
        """Run an operation against Redis, transparently failing over to FakeRedis."""
        client = self.get_client()
        try:
            return fn(client)
        except redis.RedisError as exc:
            logger.warning("Redis error (%s); switching to FakeStrictRedis.", exc)
            self._client = self._get_fake()
            self._is_fake = True
            return fn(self._client)


_manager = RedisClientManager()


def get_redis_client() -> Any:
    """Return the active Redis or FakeStrictRedis client."""
    return _manager.get_client()


def is_using_fake_redis() -> bool:
    """Return True if currently backed by in-memory FakeStrictRedis."""
    return _manager.is_fake


def ping() -> bool:
    """Ping active Redis (or FakeStrictRedis) backend."""
    return _manager.ping()


def check_rate_limit(user_id: str, tier: str) -> tuple[bool, int, int]:
    """Sliding-window rate limiter using Redis sorted sets.

    Limits:
        - FREE: 10 requests / day (86400s)
        - PRO: 60 requests / hour (3600s)
        - ADMIN: unlimited

    Returns:
        (allowed, remaining, reset_seconds)
    """
    normalized_tier = (tier or "FREE").strip().upper()
    limit, window_seconds = TIER_RATE_LIMITS.get(normalized_tier, (10, 86400))

    if limit is None:
        return (True, 999999, 0)

    key = f"ratelimit:{user_id}"
    now = time.time()
    cutoff = now - window_seconds

    def _op(client: Any) -> tuple[bool, int, int]:
        pipe = client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, current_count = pipe.execute()

        if current_count >= limit:
            oldest = client.zrange(key, 0, 0, withscores=True)
            if oldest:
                oldest_ts = float(oldest[0][1])
                reset_in = max(1, int(window_seconds - (now - oldest_ts)))
            else:
                reset_in = window_seconds
            return (False, 0, reset_in)

        member = f"{now}:{uuid.uuid4().hex[:8]}"
        pipe2 = client.pipeline()
        pipe2.zadd(key, {member: now})
        pipe2.expire(key, window_seconds)
        pipe2.execute()

        remaining = max(0, limit - (current_count + 1))
        return (True, remaining, window_seconds)

    return _manager.execute_with_fallback(_op)


def reset_rate_limit(user_id: str) -> None:
    """Clear sliding-window rate limit state for a user (tests/admin)."""
    keys = [
        f"ratelimit:{user_id}",
        f"ratelimit:FREE:{user_id}",
        f"ratelimit:PRO:{user_id}",
        f"ratelimit:ADMIN:{user_id}",
    ]
    _manager.execute_with_fallback(lambda client: client.delete(*keys))


def revoke_jti(jti: str, ttl_seconds: int) -> None:
    """Record a revoked JWT access token ID with TTL."""
    ttl = max(1, int(ttl_seconds))
    key = f"revoked:jti:{jti}"
    _manager.execute_with_fallback(lambda client: client.setex(key, ttl, "1"))


def is_jti_revoked(jti: str) -> bool:
    """Return True if the given JWT access token ID has been revoked."""
    key = f"revoked:jti:{jti}"
    return bool(_manager.execute_with_fallback(lambda client: client.exists(key)))


def revoke_token_family(family_id: str, ttl_seconds: int) -> None:
    """Mark an entire refresh-token family as revoked in Redis."""
    ttl = max(1, int(ttl_seconds))
    key = f"revoked:family:{family_id}"
    _manager.execute_with_fallback(lambda client: client.setex(key, ttl, "1"))


def is_family_revoked(family_id: str) -> bool:
    """Return True if the refresh-token family has been revoked."""
    key = f"revoked:family:{family_id}"
    return bool(_manager.execute_with_fallback(lambda client: client.exists(key)))


def _coupon_key(store_name: str, coupon_code: str) -> str:
    store_norm = (store_name or "global").strip().lower()
    code_norm = coupon_code.strip().upper()
    return f"coupon:crowd:{store_norm}:{code_norm}"


def _ensure_coupon_seeded(client: Any, store_name: str, coupon_code: str, seed_total: int = 0, seed_success: int = 0) -> str:
    key = _coupon_key(store_name, coupon_code)
    if not client.exists(key):
        code_norm = coupon_code.strip().upper()
        if seed_total > 0:
            init_total, init_success = seed_total, max(0, min(seed_success, seed_total))
        elif code_norm in SEED_COUPON_CROWD_DEFAULTS:
            init_total, init_success = SEED_COUPON_CROWD_DEFAULTS[code_norm]
        else:
            init_total, init_success = (0, 0)

        if init_total > 0:
            client.hset(key, mapping={"total": str(init_total), "success": str(init_success)})
    return key


def record_coupon_vote(
    store_name: str,
    coupon_code: str,
    worked: bool,
    seed_total: int = 0,
    seed_success: int = 0,
) -> tuple[float, int]:
    """Record a community vote for a coupon and return (success_rate, total_votes)."""

    def _op(client: Any) -> tuple[float, int]:
        key = _ensure_coupon_seeded(
            client, store_name, coupon_code, seed_total=seed_total, seed_success=seed_success
        )
        pipe = client.pipeline()
        pipe.hincrby(key, "total", 1)
        if worked:
            pipe.hincrby(key, "success", 1)
        else:
            pipe.hincrby(key, "success", 0)
        total, success = pipe.execute()
        total_int = int(total)
        success_int = int(success)
        rate = round(success_int / total_int, 4) if total_int > 0 else 1.0
        return (rate, total_int)

    return _manager.execute_with_fallback(_op)


def get_coupon_crowd_score(store_name: str, coupon_code: str) -> tuple[float, int]:
    """Fetch (success_rate, total_votes) for a store coupon from Redis (seeded if unvoted)."""

    def _op(client: Any) -> tuple[float, int]:
        key = _ensure_coupon_seeded(client, store_name, coupon_code)
        data = client.hgetall(key)
        if not data:
            return (1.0, 0)
        total_int = int(data.get("total", 0))
        success_int = int(data.get("success", 0))
        if total_int <= 0:
            return (1.0, 0)
        return (round(success_int / total_int, 4), total_int)

    return _manager.execute_with_fallback(_op)


def set_fx_rate(
    currency_from: str = "USD",
    currency_to: str = "ILS",
    rate: float = 3.65,
    ttl_seconds: int = 3600,
) -> None:
    """Cache an FX conversion rate in Redis."""
    c_from = currency_from.strip().upper()
    c_to = currency_to.strip().upper()
    key = f"fx:{c_from}:{c_to}"
    ttl = max(1, int(ttl_seconds))
    _manager.execute_with_fallback(lambda client: client.setex(key, ttl, str(float(rate))))


def get_fx_rate(currency_from: str = "USD", currency_to: str = "ILS") -> float:
    """Read FX rate from Redis with deterministic offline defaults."""
    c_from = currency_from.strip().upper()
    c_to = currency_to.strip().upper()
    if c_from == c_to:
        return 1.0

    key = f"fx:{c_from}:{c_to}"
    cached = _manager.execute_with_fallback(lambda client: client.get(key))
    if cached is not None:
        try:
            return float(cached)
        except (TypeError, ValueError):
            pass

    return DEFAULT_FX_RATES.get((c_from, c_to), settings.DEFAULT_USD_TO_ILS)


def cache_buyer_profile(
    user_id: str, profile_dict: dict[str, Any], ttl_seconds: int = 900
) -> None:
    """Cache user buyer profile JSON in Redis for sub-50ms dependency lookup."""
    key = f"profile:buyer:{user_id}"
    ttl = max(1, int(ttl_seconds))
    serialized = json.dumps(profile_dict, default=str)
    _manager.execute_with_fallback(lambda client: client.setex(key, ttl, serialized))


def get_cached_buyer_profile(user_id: str) -> dict[str, Any] | None:
    """Retrieve cached user buyer profile dict from Redis, or None on cache miss."""
    key = f"profile:buyer:{user_id}"
    raw = _manager.execute_with_fallback(lambda client: client.get(key))
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except (TypeError, ValueError):
        return None


def invalidate_buyer_profile(user_id: str) -> None:
    """Remove cached buyer profile for a user."""
    key = f"profile:buyer:{user_id}"
    _manager.execute_with_fallback(lambda client: client.delete(key))
