import asyncio
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

settings = get_settings()

_background_email_tasks: set[asyncio.Task] = set()


def background_send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    """Launches send_otp_email in background with a strong Task reference to prevent GC eviction."""
    task = asyncio.create_task(send_otp_email(to_email, otp, purpose_label))
    _background_email_tasks.add(task)
    task.add_done_callback(_background_email_tasks.discard)


async def send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    """Delivers OTP email via direct aiosmtplib with password auto-sanitization,
    and fallback log output in case outbound SMTP is unreachable."""
    print("\n" + "=" * 50)
    print(f"[SAMAI OTP CODE] Target: {to_email} | Purpose: {purpose_label} | OTP: {otp}")
    print("=" * 50 + "\n")

    username = settings.MAIL_USERNAME.strip() if settings.MAIL_USERNAME else ""
    # Strip spaces from App Passwords (e.g. 'uzdl hwfm bkch yjnw' -> 'uzdlhwfmbkchyjnw')
    password = settings.MAIL_PASSWORD.strip().replace(" ", "") if settings.MAIL_PASSWORD else ""

    if not username or not password:
        print("[SMTP NOTICE] No MAIL_USERNAME or MAIL_PASSWORD set. OTP logged above.")
        return

    mail_from = settings.MAIL_FROM.strip() if (settings.MAIL_FROM and "@" in settings.MAIL_FROM) else username
    from_name = settings.MAIL_FROM_NAME or "SamAI"

    minutes = settings.OTP_EXPIRE_SECONDS // 60
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"SamAI — Your {purpose_label} OTP"
    msg["From"] = f"{from_name} <{mail_from}>"
    msg["To"] = to_email

    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
      <h2 style="color:#4f46e5;margin-top:0">SamAI</h2>
      <p style="color:#334155;font-size:15px">Your one-time verification password for <strong>{purpose_label}</strong> is:</p>
      <div style="background:#f1f5f9;padding:16px;border-radius:8px;text-align:center;margin:20px 0">
        <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#1e1b4b">{otp}</span>
      </div>
      <p style="color:#64748b;font-size:13px;margin-bottom:0">This code will expire in {minutes} minutes.</p>
    </div>
    """
    msg.attach(MIMEText(html_body, "html"))

    try:
        # Defaults to Port 587 + STARTTLS if port is 587, or SSL if 465
        port = settings.MAIL_PORT or 587
        use_tls = settings.MAIL_SSL_TLS if settings.MAIL_SSL_TLS is not None else (port == 465)
        use_starttls = settings.MAIL_STARTTLS if settings.MAIL_STARTTLS is not None else (port == 587)

        print(f"[SMTP SENDING] Connecting to {settings.MAIL_SERVER}:{port} (TLS={use_tls}, STARTTLS={use_starttls})...")

        await aiosmtplib.send(
            msg,
            hostname=settings.MAIL_SERVER,
            port=port,
            username=username,
            password=password,
            use_tls=use_tls,
            start_tls=use_starttls,
            timeout=15,
        )
        print(f"[SMTP SUCCESS] Email delivered successfully to {to_email}!")
    except Exception as e:
        print(f"[SMTP ERROR] Failed to send email to {to_email}: {e}. OTP is logged above.")
