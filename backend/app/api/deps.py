import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.models.admin import AdminUser
from app.db.models.student import Student
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_student(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Student:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        student_id = payload.get("sub")
        if student_id is None:
            raise credentials_error
    except Exception:
        raise credentials_error

    result = await db.execute(select(Student).where(Student.id == uuid.UUID(student_id)))
    student = result.scalar_one_or_none()
    if student is None:
        raise credentials_error

    if not student.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address not verified. Please verify your email via OTP.",
        )
    return student


async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    forbidden_error = HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin access required.",
    )
    try:
        payload = decode_access_token(token)
        admin_id = payload.get("sub")
        role = payload.get("role", "student")
        if admin_id is None:
            raise credentials_error
        if role != "admin":
            raise forbidden_error
    except HTTPException:
        raise
    except Exception:
        raise credentials_error

    result = await db.execute(select(AdminUser).where(AdminUser.id == uuid.UUID(admin_id)))
    admin = result.scalar_one_or_none()
    if admin is None:
        # Fallback check by admin_id if token subject was passed as text string
        result2 = await db.execute(select(AdminUser).where(AdminUser.admin_id == str(admin_id)))
        admin = result2.scalar_one_or_none()
        if admin is None:
            raise credentials_error

    return admin



oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_optional_student(
    token: str | None = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> Student | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        student_id = payload.get("sub")
        if not student_id:
            return None
        result = await db.execute(select(Student).where(Student.id == uuid.UUID(student_id)))
        return result.scalar_one_or_none()
    except Exception:
        return None

