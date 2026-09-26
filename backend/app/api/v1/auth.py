"""
Auth flow (spec section 2) -- Production Ready Student & Admin Authentication:
  SIGNUP:
    POST /register              -> creates unverified student, emails signup OTP
    POST /verify-signup-otp     -> verifies OTP, marks student verified, returns JWT
  LOGIN:
    POST /login                 -> checks password & is_verified status, returns JWT
    POST /admin/login           -> authenticates admin credentials, returns admin JWT
  FORGOT/RESET PASSWORD:
    POST /forgot-password       -> emails reset OTP with generic response
    POST /reset-password        -> verifies reset OTP and updates password
"""
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student
from app.core.config import get_settings
from app.core.email import send_otp_email, background_send_otp_email
from app.core.otp import OTPPurpose, generate_and_store_otp, verify_otp
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models.admin import AdminUser
from app.db.models.student import Student
from app.db.session import get_db
from app.schemas.auth import (
    AdminLoginRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    RequestLoginOTPRequest,
    ResendOTPRequest,
    ResetPasswordRequest,
    StudentOut,
    TokenResponse,
    VerifyLoginOTPRequest,
    VerifySignupOTPRequest,
)

settings = get_settings()
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        clean_name = payload.name.strip()
        clean_email = payload.email.lower().strip()
        mobile = payload.mobile or "0000000000"

        if payload.confirm_password and payload.password != payload.confirm_password:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passwords do not match.")

        existing = await db.execute(
            select(Student).where(
                or_(
                    func.lower(Student.email) == clean_email,
                    func.lower(Student.name) == clean_name.lower(),
                )
            )
        )
        student = existing.scalars().first()

        if student:
            if student.is_verified:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "An account with this email address already exists. Please log in instead.",
                )
            # Update password and re-send verification OTP
            student.password_hash = hash_password(payload.password)
            student.name = clean_name
        else:
            student = Student(
                name=clean_name,
                email=clean_email,
                mobile=mobile,
                password_hash=hash_password(payload.password),
                is_verified=False,
                role="student",
            )
            db.add(student)

        await db.commit()

        # Generate and email signup OTP
        otp = await generate_and_store_otp(clean_email, OTPPurpose.SIGNUP, db=db)
        background_send_otp_email(clean_email, otp, "signup verification")

        return MessageResponse(
            message="Account registration initiated. A 6-digit verification code has been sent to your email."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Registration error: {str(e)}")


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    identifier = (payload.name or payload.email or "").strip()
    if not identifier:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Student name or email is required.")

    clean_identifier = identifier.lower()
    result = await db.execute(
        select(Student).where(
            or_(
                func.lower(Student.name) == clean_identifier,
                func.lower(Student.email) == clean_identifier,
            )
        )
    )
    students = result.scalars().all()

    student = None
    for s in students:
        if verify_password(payload.password, s.password_hash):
            student = s
            break

    if not student:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid student name/email or password.")

    if not student.is_verified:
        # Trigger OTP resend for unverified account
        otp = await generate_and_store_otp(student.email, OTPPurpose.SIGNUP, db=db)
        background_send_otp_email(student.email, otp, "signup verification")
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Email address not verified. A verification OTP has been sent to your email.",
        )

    student.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(subject=str(student.id), role=student.role)
    return TokenResponse(access_token=token)


@router.post("/request-login-otp", response_model=MessageResponse)
async def request_login_otp(payload: RequestLoginOTPRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
    student = result.scalar_one_or_none()

    if not student:
        # Create student record if not registered
        student = Student(
            name=clean_email.split("@")[0].capitalize(),
            email=clean_email,
            mobile="0000000000",
            password_hash=hash_password(secrets.token_urlsafe(12)),
            is_verified=False,
            role="student",
        )
        db.add(student)
        await db.commit()

    otp = await generate_and_store_otp(clean_email, OTPPurpose.LOGIN, db=db)
    background_send_otp_email(clean_email, otp, "login verification")

    return MessageResponse(
        message=f"A 6-digit login verification OTP code has been dispatched to {clean_email}."
    )


@router.post("/verify-login-otp", response_model=TokenResponse)
async def verify_login_otp(payload: VerifyLoginOTPRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    ok = await verify_otp(clean_email, OTPPurpose.LOGIN, payload.otp, db=db)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification code.")

    result = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student account not found.")

    student.is_verified = True
    student.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(subject=str(student.id), role=student.role)
    return TokenResponse(access_token=token)



@router.post("/admin/login", response_model=TokenResponse)
async def admin_login(payload: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    clean_id = payload.identifier.strip()
    admin_target = settings.ADMIN_ID.strip()
    admin_pass = settings.ADMIN_PASSWORD.strip() or "samai@123"

    if clean_id.lower() != admin_target.lower() or payload.password != admin_pass:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid admin ID or password.")

    # Find or seed admin user record in dedicated admins table
    result = await db.execute(
        select(AdminUser).where(func.lower(AdminUser.admin_id) == admin_target.lower())
    )
    admin_user = result.scalar_one_or_none()

    if not admin_user:
        admin_user = AdminUser(
            name="System Administrator",
            admin_id=admin_target.lower(),
            email=f"{admin_target.lower()}@samai.local",
            password_hash=hash_password(admin_pass),
            last_login=datetime.now(timezone.utc),
        )
        db.add(admin_user)
        await db.commit()
        await db.refresh(admin_user)
    else:
        admin_user.last_login = datetime.now(timezone.utc)
        await db.commit()

    token = create_access_token(subject=str(admin_user.id), role="admin")
    return TokenResponse(access_token=token)



@router.post("/verify-signup-otp", response_model=TokenResponse)
async def verify_signup_otp(payload: VerifySignupOTPRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student account not found.")

    ok = await verify_otp(clean_email, OTPPurpose.SIGNUP, payload.otp, db=db)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification code.")

    student.is_verified = True
    student.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(subject=str(student.id), role=student.role)
    return TokenResponse(access_token=token)


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
    student = result.scalar_one_or_none()

    if student:
        otp = await generate_and_store_otp(clean_email, OTPPurpose.RESET_PASSWORD, db=db)
        background_send_otp_email(clean_email, otp, "password reset")

    # Generic response to prevent email enumeration
    return MessageResponse(
        message="If an account exists for this email, a password reset code has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    ok = await verify_otp(clean_email, OTPPurpose.RESET_PASSWORD, payload.otp, db=db)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset code.")

    result = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
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
    result = await db.execute(select(Student).where(func.lower(Student.email) == clean_email))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student account not found.")

    if payload.purpose == "login":
        purpose_enum = OTPPurpose.LOGIN
    elif payload.purpose == "reset_password":
        purpose_enum = OTPPurpose.RESET_PASSWORD
    else:
        purpose_enum = OTPPurpose.SIGNUP

    otp = await generate_and_store_otp(clean_email, purpose_enum, db=db)
    background_send_otp_email(clean_email, otp, f"{purpose_enum.value} verification code")

    return MessageResponse(message="A new 6-digit code has been sent to your email.")


@router.get("/me", response_model=StudentOut)
async def get_me(current_student: Student = Depends(get_current_student)):
    return current_student


@router.post("/test-email", response_model=MessageResponse)
async def send_test_email(to_email: str = "kushalyngowda136@gmail.com"):
    """Dispatches a test email via configured Gmail SMTP server."""
    await send_otp_email(to_email, "998877", "SamAI Production Test Email")
    return MessageResponse(message=f"Test email dispatched to {to_email}. Please check your inbox.")

