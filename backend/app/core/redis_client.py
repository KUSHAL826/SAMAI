from redis.asyncio import Redis, from_url

from app.core.config import get_settings

settings = get_settings()

_redis: Redis | None = None


def get_redis() -> Redis:
    """Single shared connection pool -- same Redis instance already used
    for Celery, reused here for OTP storage so we don't add another service."""
    global _redis
    if _redis is None:
        _redis = from_url(settings.REDIS_URL, decode_responses=True)
    return _redis
