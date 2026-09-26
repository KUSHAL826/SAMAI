import asyncio
import smtplib
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


def _sync_send_gmail_smtp(
    username: str, password: str, server_host: str, port: int, to_email: str, subject: str, html_body: str
) -> bool:
    """Synchronous Gmail SMTP delivery function executed via worker thread."""
    clean_pwd = password.strip().replace(" ", "")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    # Raw email in From header to strictly satisfy Gmail SPF/DKIM policy
    msg["From"] = username.strip()
    msg["To"] = to_email.strip()
    msg.attach(MIMEText(html_body, "html"))

    if port == 465:
        with smtplib.SMTP_SSL(server_host, port, timeout=15) as server:
            server.login(username.strip(), clean_pwd)
            server.sendmail(username.strip(), [to_email.strip()], msg.as_string())
    else:
        with smtplib.SMTP(server_host, port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(username.strip(), clean_pwd)
            server.sendmail(username.strip(), [to_email.strip()], msg.as_string())
    return True


async def send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    """Delivers OTP email via direct Gmail SMTP using asyncio.to_thread and standard smtplib."""
    log_otp = otp if settings.ENVIRONMENT == "development" else "******"
    print("\n" + "=" * 50)
    print(f"[SAMAI EMAIL DISPATCH] Target: {to_email} | Purpose: {purpose_label} | OTP: {log_otp}")
    print("=" * 50 + "\n")

    minutes = settings.OTP_EXPIRE_SECONDS // 60
    subject = f"SamAI — Your {purpose_label} OTP"
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

    username = settings.MAIL_USERNAME.strip() if settings.MAIL_USERNAME else ""
    password = settings.MAIL_PASSWORD.strip().replace(" ", "") if settings.MAIL_PASSWORD else ""

    if not username or not password:
        print("[SMTP NOTICE] No MAIL_USERNAME or MAIL_PASSWORD set. OTP logged above.")
        return

    try:
        server_host = settings.MAIL_SERVER or "smtp.gmail.com"
        port = settings.MAIL_PORT or 587
        print(f"[GMAIL SMTP SENDING] Delivering email to {to_email} via {server_host}:{port}...")

        await asyncio.to_thread(
            _sync_send_gmail_smtp,
            username,
            password,
            server_host,
            port,
            to_email,
            subject,
            html_body,
        )
        print(f"[GMAIL SMTP SUCCESS] Delivered email successfully to {to_email}!")
    except Exception as e:
        print(f"[GMAIL SMTP ERROR] Failed to send email to {to_email}: {e}. OTP is logged above.")
