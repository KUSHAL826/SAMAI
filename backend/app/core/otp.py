import enum
import secrets
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.redis_client import get_redis
from app.core.security import hash_password, verify_password

settings = get_settings()


class OTPPurpose(str, enum.Enum):
    SIGNUP = "signup"
    LOGIN = "login"
    RESET_PASSWORD = "reset_password"


def _redis_key(email: str, purpose: OTPPurpose) -> str:
    return f"otp:{purpose.value}:{email.lower().strip()}"


def _attempts_key(email: str, purpose: OTPPurpose) -> str:
    return f"otp_attempts:{purpose.value}:{email.lower().strip()}"


_memory_otp_store: dict[str, tuple[str, float]] = {}


def generate_numeric_code(length: int = 6) -> str:
    """Generates a secure random numeric OTP (e.g. '849201')."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def _mask_email(email: str) -> str:
    parts = email.split("@")
    if len(parts) == 2:
        return f"{parts[0][:3]}***@{parts[1]}"
    return "***@***"


async def generate_and_store_otp(
    email: str, purpose: OTPPurpose, db: AsyncSession | None = None
) -> str:
    """Generates a numeric OTP, hashes it, and stores it in DB, Redis, and memory.
    Any new OTP request invalidates the previous OTP for that purpose."""
    clean_email = email.lower().strip()
    otp = generate_numeric_code(settings.OTP_LENGTH)
    key = _redis_key(clean_email, purpose)
    hashed = hash_password(otp)
    expires_at_dt = datetime.now(timezone.utc) + timedelta(seconds=settings.OTP_EXPIRE_SECONDS)

    print(f"[OTP AUDIT] Request received to generate {purpose.value} OTP for '{_mask_email(clean_email)}'.")

    # 1. DB storage (Primary persistent store across workers & restarts)
    if db is not None:
        try:
            from app.db.models.student import Student

            res = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
            student = res.scalar_one_or_none()
            if student:
                student.otp_hash = hashed
                student.otp_expires_at = expires_at_dt
                student.otp_purpose = purpose.value
                await db.commit()
                print(f"[OTP AUDIT] Successfully stored hashed OTP in DB for '{_mask_email(clean_email)}'.")
        except Exception as db_err:
            print(f"[OTP WARNING] DB store error: {db_err}")

    # 2. Redis store (Fast cache lookup)
    try:
        redis = get_redis()
        await redis.set(key, hashed, ex=settings.OTP_EXPIRE_SECONDS)
        await redis.delete(_attempts_key(clean_email, purpose))
        print(f"[OTP AUDIT] Successfully cached OTP in Redis for '{_mask_email(clean_email)}'.")
    except Exception as redis_err:
        print(f"[OTP NOTICE] Redis cache store notice: {redis_err}")

    # 3. Memory store backup
    _memory_otp_store[key] = (hashed, time.time() + settings.OTP_EXPIRE_SECONDS)
    print(f"[OTP AUDIT] OTP generation completed for '{_mask_email(clean_email)}' (Expires in {settings.OTP_EXPIRE_SECONDS}s).")

    return otp


async def verify_otp(
    email: str, purpose: OTPPurpose, submitted_otp: str, db: AsyncSession | None = None
) -> bool:
    """Checks submitted OTP against DB, Redis, and memory. Valid for expiry period."""
    clean_email = email.lower().strip()
    clean_submitted = submitted_otp.strip()
    key = _redis_key(clean_email, purpose)
    attempts_key = _attempts_key(clean_email, purpose)

    print(f"[OTP AUDIT] Verifying {purpose.value} OTP for '{_mask_email(clean_email)}'.")

    # 1. Check DB first (Primary source of truth)
    if db is not None:
        try:
            from app.db.models.student import Student

            res = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
            student = res.scalar_one_or_none()
            if student and student.otp_hash and student.otp_expires_at and student.otp_purpose == purpose.value:
                now = datetime.now(timezone.utc)
                exp = student.otp_expires_at
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)

                if now <= exp and verify_password(clean_submitted, student.otp_hash):
                    student.otp_hash = None
                    student.otp_expires_at = None
                    student.otp_purpose = None
                    await db.commit()
                    _memory_otp_store.pop(key, None)
                    print(f"[OTP AUDIT] DB Verification SUCCESS for '{_mask_email(clean_email)}' ({purpose.value}).")
                    return True
                elif now > exp:
                    print(f"[OTP AUDIT] DB Verification FAILED for '{_mask_email(clean_email)}': OTP Expired.")
                else:
                    print(f"[OTP AUDIT] DB Verification FAILED for '{_mask_email(clean_email)}': Incorrect Code.")
        except Exception as db_err:
            print(f"[OTP WARNING] DB verify error: {db_err}")

    # 2. Redis verification fallback
    try:
        redis = get_redis()
        attempts = int(await redis.get(attempts_key) or 0)
        if attempts < 5:
            stored_hash = await redis.get(key)
            if stored_hash and verify_password(clean_submitted, stored_hash):
                await redis.delete(key)
                await redis.delete(attempts_key)
                _memory_otp_store.pop(key, None)
                print(f"[OTP AUDIT] Redis Verification SUCCESS for '{_mask_email(clean_email)}' ({purpose.value}).")
                return True
            elif stored_hash:
                await redis.incr(attempts_key)
                await redis.expire(attempts_key, settings.OTP_EXPIRE_SECONDS)
                print(f"[OTP AUDIT] Redis Verification FAILED for '{_mask_email(clean_email)}': Incorrect Code (Attempt {attempts + 1}).")
    except Exception as redis_err:
        print(f"[OTP NOTICE] Redis verify notice: {redis_err}")

    # 3. Memory store fallback
    if key in _memory_otp_store:
        hashed, expires_at = _memory_otp_store[key]
        if time.time() <= expires_at and verify_password(clean_submitted, hashed):
            _memory_otp_store.pop(key, None)
            print(f"[OTP AUDIT] Memory Store Verification SUCCESS for '{_mask_email(clean_email)}' ({purpose.value}).")
            return True

    print(f"[OTP AUDIT] Overall Verification FAILED for '{_mask_email(clean_email)}' ({purpose.value}).")
    return False
