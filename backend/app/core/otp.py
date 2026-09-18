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


async def generate_and_store_otp(email: str, purpose: OTPPurpose) -> str:
    """Generates a numeric OTP, hashes it, and stores it in Redis with a TTL.
    Returns the plaintext OTP so the caller can email it."""
    redis = get_redis()

    # A fresh random base32 secret per request means each OTP is unique and
    # cannot be predicted or replayed, unlike a fixed shared TOTP secret.
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret, digits=settings.OTP_LENGTH, interval=settings.OTP_EXPIRE_SECONDS)
    otp = totp.now()

    key = _redis_key(email, purpose)
    await redis.set(key, hash_password(otp), ex=settings.OTP_EXPIRE_SECONDS)
    await redis.delete(_attempts_key(email, purpose))  # reset lockout on new OTP

    return otp


async def verify_otp(email: str, purpose: OTPPurpose, submitted_otp: str) -> bool:
    """Checks the submitted OTP against the stored hash. Locks out after
    5 failed attempts to prevent brute-forcing a 6-digit code."""
    redis = get_redis()
    key = _redis_key(email, purpose)
    attempts_key = _attempts_key(email, purpose)

    attempts = int(await redis.get(attempts_key) or 0)
    if attempts >= 5:
        return False

    stored_hash = await redis.get(key)
    if not stored_hash:
        return False  # expired or never requested

    if verify_password(submitted_otp, stored_hash):
        await redis.delete(key)
        await redis.delete(attempts_key)
        return True

    await redis.incr(attempts_key)
    await redis.expire(attempts_key, settings.OTP_EXPIRE_SECONDS)
    return False
