"""Redis cache helper for marketplace price data.

Caches marketplace search results for 24 hours to avoid
hitting rate limits on external sites.
"""

import json
import hashlib
import structlog

logger = structlog.get_logger()

_redis = None
_redis_available = False

CACHE_TTL = 86400  # 24 hours


async def _get_redis():
    """Lazy-init async Redis connection."""
    global _redis, _redis_available
    if _redis is not None:
        return _redis

    from app.config import settings

    if not settings.redis_url:
        _redis_available = False
        return None

    try:
        from redis.asyncio import Redis

        _redis = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=3,
        )
        await _redis.ping()
        _redis_available = True
        logger.info("redis_cache_connected")
        return _redis
    except Exception as e:
        logger.warning("redis_cache_unavailable", error=str(e))
        _redis_available = False
        _redis = None
        return None


def _cache_key(prefix: str, query: str) -> str:
    h = hashlib.md5(query.lower().strip().encode()).hexdigest()[:12]
    return f"price_cache:{prefix}:{h}"


async def cache_get(prefix: str, query: str) -> list[dict] | None:
    """Get cached marketplace results. Returns None on miss."""
    r = await _get_redis()
    if r is None:
        return None
    try:
        key = _cache_key(prefix, query)
        data = await r.get(key)
        if data:
            logger.info("cache_hit", prefix=prefix, query=query[:50])
            return json.loads(data)
    except Exception as e:
        logger.warning("cache_get_error", error=str(e))
    return None


async def cache_set(prefix: str, query: str, results: list[dict]) -> None:
    """Cache marketplace results for 24h."""
    r = await _get_redis()
    if r is None:
        return
    try:
        key = _cache_key(prefix, query)
        await r.set(key, json.dumps(results, ensure_ascii=False), ex=CACHE_TTL)
    except Exception as e:
        logger.warning("cache_set_error", error=str(e))
