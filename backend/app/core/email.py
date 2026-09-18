from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.core.config import get_settings

settings = get_settings()

mail_config = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)

fm = FastMail(mail_config)


async def send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    minutes = settings.OTP_EXPIRE_SECONDS // 60
    message = MessageSchema(
        subject=f"SamAI — Your {purpose_label} OTP",
        recipients=[to_email],
        body=f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#4f46e5">SamAI</h2>
          <p>Your one-time password for {purpose_label} is:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{otp}</p>
          <p>This code expires in {minutes} minutes. If you didn't request this, you can ignore this email.</p>
        </div>
        """,
        subtype=MessageType.html,
    )
    await fm.send_message(message)
