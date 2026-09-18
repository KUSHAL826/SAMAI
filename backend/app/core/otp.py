"""
OTP handling for email verification (signup) and passwordless-style
login confirmation.

Uses `pyotp` (prebuilt, widely-used OTP library) to generate the code,
and Redis (already in our stack for caching/Celery) as expiring storage --
no extra table or service needed. The OTP itself is hashed before being
stored, exactly like a password.
"""
import enum

import pyotp

from app.core.config import get_settings
from app.core.redis_client import get_redis
from app.core.security import hash_password, verify_password

settings = get_settings()


class OTPPurpose(str, enum.Enum):
    SIGNUP = "signup"
    LOGIN = "login"


def _redis_key(email: str, purpose: OTPPurpose) -> str:
    return f"otp:{purpose.value}:{email.lower().strip()}"


def _attempts_key(email: str, purpose: OTPPurpose) -> str:
    return f"otp_attempts:{purpose.value}:{email.lower().strip()}"


import time

_memory_otp_store: dict[str, tuple[str, float]] = {}


async def generate_and_store_otp(email: str, purpose: OTPPurpose) -> str:
    """Generates a numeric OTP, hashes it, and stores it in Redis with a TTL.
    Falls back to in-memory store if Redis is unavailable."""
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret, digits=settings.OTP_LENGTH, interval=settings.OTP_EXPIRE_SECONDS)
    otp = totp.now()

    key = _redis_key(email, purpose)
    hashed = hash_password(otp)

    try:
        redis = get_redis()
        await redis.set(key, hashed, ex=settings.OTP_EXPIRE_SECONDS)
        await redis.delete(_attempts_key(email, purpose))
    except Exception as e:
        print(f"[OTP WARNING] Redis unavailable, using memory store: {e}")
        _memory_otp_store[key] = (hashed, time.time() + settings.OTP_EXPIRE_SECONDS)

    return otp


async def verify_otp(email: str, purpose: OTPPurpose, submitted_otp: str) -> bool:
    """Checks the submitted OTP against the stored hash."""
    key = _redis_key(email, purpose)
    attempts_key = _attempts_key(email, purpose)

    try:
        redis = get_redis()
        attempts = int(await redis.get(attempts_key) or 0)
        if attempts >= 5:
            return False

        stored_hash = await redis.get(key)
        if stored_hash and verify_password(submitted_otp, stored_hash):
            await redis.delete(key)
            await redis.delete(attempts_key)
            return True
        elif stored_hash:
            await redis.incr(attempts_key)
            await redis.expire(attempts_key, settings.OTP_EXPIRE_SECONDS)
            return False
    except Exception as e:
        print(f"[OTP WARNING] Redis verify fallback to memory store: {e}")

    # Fallback to memory store
    if key in _memory_otp_store:
        hashed, expires_at = _memory_otp_store[key]
        if time.time() < expires_at and verify_password(submitted_otp, hashed):
            del _memory_otp_store[key]
            return True

    return False

