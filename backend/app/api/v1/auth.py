"""
Auth flow (spec section 2), extended with email-OTP verification:

  SIGNUP:
    POST /register              -> creates unverified student, emails OTP
    POST /verify-signup-otp     -> marks verified, returns JWT

  LOGIN:
    POST /login                 -> checks password, emails a fresh OTP
    POST /verify-login-otp      -> confirms OTP, returns JWT

  POST /resend-otp              -> re-sends a fresh OTP for either flow

OTP is generated with pyotp, hashed, and stored in Redis with a TTL
(app/core/otp.py). Emails are sent with fastapi-mail over plain SMTP
(app/core/email.py) -- no paid email API required.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student
from app.core.email import send_otp_email
from app.core.otp import OTPPurpose, generate_and_store_otp, verify_otp
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models.student import Student
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResendOTPRequest,
    StudentOut,
    TokenResponse,
    VerifyLoginOTPRequest,
    VerifySignupOTPRequest,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    try:
        existing = await db.execute(select(Student).where(Student.email == payload.email))
        student = existing.scalar_one_or_none()

        if student and student.is_verified:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with this email already exists.")

        if student and not student.is_verified:
            student.name = payload.name
            student.mobile = payload.mobile
            student.password_hash = hash_password(payload.password)
        else:
            student = Student(
                name=payload.name,
                email=payload.email,
                mobile=payload.mobile,
                password_hash=hash_password(payload.password),
                is_verified=False,
            )
            db.add(student)

        await db.commit()

        otp = await generate_and_store_otp(payload.email, OTPPurpose.SIGNUP)
        background_tasks.add_task(send_otp_email, payload.email, otp, "account verification")

        return MessageResponse(message="OTP sent to your email. Verify to complete registration.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Registration error: {str(e)}")


@router.post("/verify-signup-otp", response_model=TokenResponse)
async def verify_signup_otp(payload: VerifySignupOTPRequest, db: AsyncSession = Depends(get_db)):
    ok = await verify_otp(payload.email, OTPPurpose.SIGNUP, payload.otp)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired OTP.")

    result = await db.execute(select(Student).where(Student.email == payload.email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    student.is_verified = True
    await db.commit()

    token = create_access_token(subject=str(student.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=MessageResponse)
async def login(payload: LoginRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Student).where(Student.email == payload.email))
    student = result.scalar_one_or_none()

    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not student or not verify_password(payload.password, student.password_hash):
        raise invalid

    if not student.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Please verify your email before logging in.")

    otp = await generate_and_store_otp(payload.email, OTPPurpose.LOGIN)
    background_tasks.add_task(send_otp_email, payload.email, otp, "login")

    return MessageResponse(message="Password verified. OTP sent to your email.")


@router.post("/verify-login-otp", response_model=TokenResponse)
async def verify_login_otp(payload: VerifyLoginOTPRequest, db: AsyncSession = Depends(get_db)):
    ok = await verify_otp(payload.email, OTPPurpose.LOGIN, payload.otp)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired OTP.")

    result = await db.execute(select(Student).where(Student.email == payload.email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    from datetime import datetime, timezone

    student.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(subject=str(student.id))
    return TokenResponse(access_token=token)


@router.post("/resend-otp", response_model=MessageResponse)
async def resend_otp(payload: ResendOTPRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    if payload.purpose not in ("signup", "login"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "purpose must be 'signup' or 'login'.")

    result = await db.execute(select(Student).where(Student.email == payload.email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    purpose = OTPPurpose.SIGNUP if payload.purpose == "signup" else OTPPurpose.LOGIN
    otp = await generate_and_store_otp(payload.email, purpose)
    background_tasks.add_task(send_otp_email, payload.email, otp, payload.purpose)

    return MessageResponse(message="A new OTP has been sent to your email.")



@router.get("/me", response_model=StudentOut)
async def get_me(current_student: Student = Depends(get_current_student)):
    return current_student
