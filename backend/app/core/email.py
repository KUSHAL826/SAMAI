from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.core.config import get_settings

settings = get_settings()

mail_from = (
    settings.MAIL_FROM
    if (settings.MAIL_FROM and "@" in settings.MAIL_FROM)
    else (settings.MAIL_USERNAME if (settings.MAIL_USERNAME and "@" in settings.MAIL_USERNAME) else "noreply@samai.com")
)

try:
    mail_config = ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME,
        MAIL_PASSWORD=settings.MAIL_PASSWORD,
        MAIL_FROM=mail_from,
        MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_STARTTLS=settings.MAIL_STARTTLS,
        MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=False,
    )
    fm = FastMail(mail_config)
except Exception as init_err:
    print(f"[SMTP INIT WARNING] {init_err}")
    fm = None


async def send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    # Always print OTP clearly to server logs so user can test even if cloud network blocks SMTP
    print("\n" + "=" * 50)
    print(f"[SAMAI OTP CODE] Target: {to_email} | Purpose: {purpose_label} | OTP: {otp}")
    print("=" * 50 + "\n")

    try:
        if fm is not None and settings.MAIL_USERNAME and settings.MAIL_PASSWORD:
            minutes = settings.OTP_EXPIRE_SECONDS // 60
            message = MessageSchema(
                subject=f"SamAI — Your {purpose_label} OTP",
                recipients=[to_email],
                body=f"""
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
                  <h2 style="color:#4f46e5">SamAI</h2>
                  <p>Your one-time password for {purpose_label} is:</p>
                  <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{otp}</p>
                  <p>This code expires in {minutes} minutes.</p>
                </div>
                """,
                subtype=MessageType.html,
            )
            await fm.send_message(message)
    except BaseException as e:
        print(f"[SMTP NOTICE] Outbound SMTP network skipped/failed ({e}). OTP is logged above.")
