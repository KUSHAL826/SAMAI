"""
Auth flow (spec section 2) -- direct signup and login without OTP requirements:

  SIGNUP:
    POST /register              -> creates student, marks verified, returns JWT directly
  LOGIN:
    POST /login                 -> checks password, returns JWT directly

  FORGOT PASSWORD:
    POST /forgot-password       -> emails password reset OTP
    POST /reset-password        -> verifies reset OTP and updates password
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student
from app.core.config import get_settings
from app.core.email import background_send_otp_email
from app.core.otp import OTPPurpose, generate_and_store_otp, verify_otp
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models.student import Student
from app.db.session import get_db
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResendOTPRequest,
    ResetPasswordRequest,
    StudentOut,
    TokenResponse,
    VerifyLoginOTPRequest,
    VerifySignupOTPRequest,
)

settings = get_settings()
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        clean_email = payload.email.lower().strip()
        existing = await db.execute(select(Student).where(Student.email == clean_email))
        student = existing.scalar_one_or_none()

        if student:
            # If student exists, update credentials and mark verified
            student.name = payload.name
            student.mobile = payload.mobile
            student.password_hash = hash_password(payload.password)
            student.is_verified = True
        else:
            student = Student(
                name=payload.name,
                email=clean_email,
                mobile=payload.mobile,
                password_hash=hash_password(payload.password),
                is_verified=True,
            )
            db.add(student)

        await db.commit()

        token = create_access_token(subject=str(student.id))
        return TokenResponse(access_token=token)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Registration error: {str(e)}")


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(Student.email == clean_email))
    student = result.scalar_one_or_none()

    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not student or not verify_password(payload.password, student.password_hash):
        raise invalid

    student.is_verified = True
    student.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(subject=str(student.id))
    return TokenResponse(access_token=token)


@router.post("/verify-signup-otp", response_model=TokenResponse)
async def verify_signup_otp(payload: VerifySignupOTPRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(Student.email == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    student.is_verified = True
    await db.commit()

    token = create_access_token(subject=str(student.id))
    return TokenResponse(access_token=token)


@router.post("/verify-login-otp", response_model=TokenResponse)
async def verify_login_otp(payload: VerifyLoginOTPRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(Student.email == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    student.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(subject=str(student.id))
    return TokenResponse(access_token=token)


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(Student.email == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account registered with this email address.")

    otp = await generate_and_store_otp(clean_email, OTPPurpose.RESET_PASSWORD, db=db)
    background_send_otp_email(clean_email, otp, "password reset")

    msg = "Password reset code sent to your email."
    if settings.SHOW_OTP_IN_RESPONSE:
        msg = f"{msg} (Code: {otp})"
    return MessageResponse(message=msg)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    ok = await verify_otp(clean_email, OTPPurpose.RESET_PASSWORD, payload.otp, db=db)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset code.")

    result = await db.execute(select(Student).where(Student.email == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    student.password_hash = hash_password(payload.new_password)
    student.is_verified = True
    await db.commit()

    return MessageResponse(message="Password reset successfully. You can now log in.")


@router.post("/resend-otp", response_model=MessageResponse)
async def resend_otp(payload: ResendOTPRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(Student.email == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    otp = await generate_and_store_otp(clean_email, OTPPurpose.RESET_PASSWORD, db=db)
    background_send_otp_email(clean_email, otp, "OTP reset")

    msg = "A new OTP has been sent to your email."
    if settings.SHOW_OTP_IN_RESPONSE:
        msg = f"{msg} (Code: {otp})"
    return MessageResponse(message=msg)


@router.get("/me", response_model=StudentOut)
async def get_me(current_student: Student = Depends(get_current_student)):
    return current_student
