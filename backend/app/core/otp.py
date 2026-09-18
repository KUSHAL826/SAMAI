import enum
import secrets
import time

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


_memory_otp_store: dict[str, tuple[str, float]] = {}


def generate_numeric_code(length: int = 6) -> str:
    """Generates a secure random numeric OTP (e.g. '849201')."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


async def generate_and_store_otp(email: str, purpose: OTPPurpose) -> str:
    """Generates a numeric OTP, hashes it, and stores it in Redis / memory with a 5-minute TTL."""
    otp = generate_numeric_code(settings.OTP_LENGTH)
    key = _redis_key(email, purpose)
    hashed = hash_password(otp)

    try:
        redis = get_redis()
        await redis.set(key, hashed, ex=settings.OTP_EXPIRE_SECONDS)
        await redis.delete(_attempts_key(email, purpose))
    except Exception as e:
        print(f"[OTP WARNING] Redis unavailable, using memory store: {e}")
        _memory_otp_store[key] = (hashed, time.time() + settings.OTP_EXPIRE_SECONDS)

    # Also store in memory as instant backup
    _memory_otp_store[key] = (hashed, time.time() + settings.OTP_EXPIRE_SECONDS)

    return otp


async def verify_otp(email: str, purpose: OTPPurpose, submitted_otp: str) -> bool:
    """Checks the submitted OTP against the stored hash. Valid for 5 full minutes."""
    clean_submitted = submitted_otp.strip()
    key = _redis_key(email, purpose)
    attempts_key = _attempts_key(email, purpose)

    # 1. Try Redis verification first
    try:
        redis = get_redis()
        attempts = int(await redis.get(attempts_key) or 0)
        if attempts < 5:
            stored_hash = await redis.get(key)
            if stored_hash and verify_password(clean_submitted, stored_hash):
                await redis.delete(key)
                await redis.delete(attempts_key)
                _memory_otp_store.pop(key, None)
                return True
            elif stored_hash:
                await redis.incr(attempts_key)
                await redis.expire(attempts_key, settings.OTP_EXPIRE_SECONDS)
    except Exception as e:
        print(f"[OTP WARNING] Redis verify error: {e}")

    # 2. Memory store fallback (guarantees verification succeeds even if Redis is slow)
    if key in _memory_otp_store:
        hashed, expires_at = _memory_otp_store[key]
        if time.time() < expires_at and verify_password(clean_submitted, hashed):
            _memory_otp_store.pop(key, None)
            return True

    return False
