import asyncio
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

settings = get_settings()


def _mask_email(email: str) -> str:
    """Safely mask email for logs (e.g. k***a@gmail.com)."""
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked_local}@{domain}"


def send_otp_email_sync(to_email: str, otp: str, purpose_label: str) -> bool:
    """
    Synchronous direct SMTP email dispatch using Python standard library smtplib.
    Features dual-port fallback (Port 587 STARTTLS -> Port 465 SSL/TLS).
    Guaranteed non-blocking execution when wrapped in background threads.
    """
    clean_to_email = to_email.strip().lower()
    masked_target = _mask_email(clean_to_email)
    log_otp = otp if settings.ENVIRONMENT == "development" else "******"

    print("\n" + "=" * 60, flush=True)
    print(f"[EMAIL DISPATCH START] Target: {masked_target} | Purpose: {purpose_label} | OTP: {log_otp}", flush=True)
    print("=" * 60 + "\n", flush=True)

    username = settings.MAIL_USERNAME.strip() if settings.MAIL_USERNAME else ""
    password = settings.MAIL_PASSWORD.strip().replace(" ", "") if settings.MAIL_PASSWORD else ""

    if not username or not password:
        print(f"[EMAIL NOTICE] No MAIL_USERNAME or MAIL_PASSWORD configured. OTP logged above: {otp}", flush=True)
        return False

    minutes = settings.OTP_EXPIRE_SECONDS // 60
    subject = f"SamAI — Your {purpose_label} OTP Verification Code"
    html_body = f"""
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:500px;margin:auto;padding:28px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
      <div style="text-align:center;border-bottom:2px solid #4f46e5;padding-bottom:16px;margin-bottom:20px">
        <h2 style="color:#4f46e5;margin:0;font-size:24px;letter-spacing:1px">SamAI Examination Portal</h2>
        <span style="color:#64748b;font-size:12px">AI-Powered NEET, KCET & JEE Entrance Examination Platform</span>
      </div>
      <p style="color:#334155;font-size:15px;line-height:1.5">Hello,</p>
      <p style="color:#334155;font-size:15px;line-height:1.5">Your one-time verification password for <strong>{purpose_label}</strong> is:</p>
      <div style="background:#f1f5f9;border:1px border #cbd5e1;padding:20px;border-radius:10px;text-align:center;margin:24px 0">
        <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1e1b4b;font-family:monospace">{otp}</span>
      </div>
      <p style="color:#475569;font-size:13px;line-height:1.5">This OTP is valid for <strong>{minutes} minutes</strong>. Please do not share this verification code with anyone.</p>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0" />
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0">If you did not request this verification code, please ignore this email.</p>
    </div>
    """

    from_name = settings.MAIL_FROM_NAME or "SamAI Portal"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{username}>"
    msg["To"] = clean_to_email
    msg.attach(MIMEText(html_body, "html"))

    server_host = settings.MAIL_SERVER or "smtp.gmail.com"

    # Strategy 1: Port 587 STARTTLS
    try:
        with smtplib.SMTP(server_host, 587, timeout=12) as s:
            s.ehlo()
            s.starttls()
            s.ehlo()
            s.login(username, password)
            s.sendmail(username, [clean_to_email], msg.as_string())
        print(f"[EMAIL SUCCESS] Delivered OTP email to {masked_target} via SMTP Port 587!", flush=True)
        return True
    except Exception as err587:
        print(f"[EMAIL PORT 587 NOTICE] Port 587 failed for {masked_target}: {err587}. Trying Port 465 SSL...", flush=True)

    # Strategy 2: Port 465 SSL/TLS
    try:
        with smtplib.SMTP_SSL(server_host, 465, timeout=12) as s:
            s.ehlo()
            s.login(username, password)
            s.sendmail(username, [clean_to_email], msg.as_string())
        print(f"[EMAIL SUCCESS] Delivered OTP email to {masked_target} via SMTP Port 465 SSL!", flush=True)
        return True
    except Exception as err465:
        print(f"[EMAIL CRITICAL ERROR] All SMTP delivery attempts failed for {masked_target}: {err465}", flush=True)
        return False


def background_send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    """Launches send_otp_email_sync immediately in a dedicated background Thread with flush logging."""
    t = threading.Thread(
        target=send_otp_email_sync,
        args=(to_email, otp, purpose_label),
        daemon=True,
    )
    t.start()


async def send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    """Async wrapper around send_otp_email_sync."""
    await asyncio.to_thread(send_otp_email_sync, to_email, otp, purpose_label)
