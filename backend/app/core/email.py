import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from app.core.config import get_settings

settings = get_settings()

_background_email_tasks: set[asyncio.Task] = set()


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


def background_send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    """Launches send_otp_email in background with a strong Task reference to prevent GC eviction."""
    task = asyncio.create_task(send_otp_email(to_email, otp, purpose_label))
    _background_email_tasks.add(task)
    task.add_done_callback(_background_email_tasks.discard)


async def send_otp_email(to_email: str, otp: str, purpose_label: str) -> None:
    """
    Delivers OTP email using FastAPI-Mail (the Python equivalent of PHPMailer in PHP),
    featuring automatic dual-port fallback (Port 587 STARTTLS -> Port 465 SSL/TLS -> smtplib).
    """
    clean_to_email = to_email.strip().lower()
    masked_target = _mask_email(clean_to_email)
    log_otp = otp if settings.ENVIRONMENT == "development" else "******"

    print("\n" + "=" * 60)
    print(f"[FASTAPI-MAIL DISPATCH] Target: {masked_target} | Purpose: {purpose_label} | OTP: {log_otp}")
    print("=" * 60 + "\n")

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

    username = settings.MAIL_USERNAME.strip() if settings.MAIL_USERNAME else ""
    password = settings.MAIL_PASSWORD.strip().replace(" ", "") if settings.MAIL_PASSWORD else ""

    if not username or not password:
        print("[FASTAPI-MAIL NOTICE] No MAIL_USERNAME or MAIL_PASSWORD configured. OTP logged above.")
        return

    server_host = settings.MAIL_SERVER or "smtp.gmail.com"
    primary_port = settings.MAIL_PORT or 587
    from_name = settings.MAIL_FROM_NAME or "SamAI Portal"

    # Attempt 1: Send via FastAPI-Mail (Primary configured port & protocol)
    try:
        use_tls = True if primary_port != 465 else False
        use_ssl = True if primary_port == 465 else False

        conf = ConnectionConfig(
            MAIL_USERNAME=username,
            MAIL_PASSWORD=password,
            MAIL_FROM=username,
            MAIL_PORT=primary_port,
            MAIL_SERVER=server_host,
            MAIL_FROM_NAME=from_name,
            MAIL_STARTTLS=use_tls,
            MAIL_SSL_TLS=use_ssl,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )

        message = MessageSchema(
            subject=subject,
            recipients=[clean_to_email],
            body=html_body,
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        await fm.send_message(message)
        print(f"[FASTAPI-MAIL SUCCESS] Delivered email successfully to {masked_target} via port {primary_port}!")
        return
    except Exception as primary_err:
        print(f"[FASTAPI-MAIL NOTICE] Primary port {primary_port} failed for {masked_target}: {primary_err}. Trying fallback port...")

    # Attempt 2: Dual-Port Fallback (If 587 failed, try 465 SSL/TLS; if 465 failed, try 587 STARTTLS)
    fallback_port = 465 if primary_port != 465 else 587
    try:
        use_tls_fb = True if fallback_port != 465 else False
        use_ssl_fb = True if fallback_port == 465 else False

        conf_fb = ConnectionConfig(
            MAIL_USERNAME=username,
            MAIL_PASSWORD=password,
            MAIL_FROM=username,
            MAIL_PORT=fallback_port,
            MAIL_SERVER=server_host,
            MAIL_FROM_NAME=from_name,
            MAIL_STARTTLS=use_tls_fb,
            MAIL_SSL_TLS=use_ssl_fb,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )

        message_fb = MessageSchema(
            subject=subject,
            recipients=[clean_to_email],
            body=html_body,
            subtype=MessageType.html,
        )

        fm_fb = FastMail(conf_fb)
        await fm_fb.send_message(message_fb)
        print(f"[FASTAPI-MAIL FALLBACK SUCCESS] Delivered email successfully to {masked_target} via fallback port {fallback_port}!")
        return
    except Exception as fb_err:
        print(f"[FASTAPI-MAIL FALLBACK ERROR] Fallback port {fallback_port} failed for {masked_target}: {fb_err}.")

    # Attempt 3: Synchronous smtplib fallback (worker thread)
    try:
        def _sync_fallback():
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{username}>"
            msg["To"] = clean_to_email
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(server_host, 587, timeout=15) as s:
                s.ehlo()
                s.starttls()
                s.ehlo()
                s.login(username, password)
                s.sendmail(username, [clean_to_email], msg.as_string())

        await asyncio.to_thread(_sync_fallback)
        print(f"[SMTP FALLBACK SUCCESS] Delivered email via smtplib fallback to {masked_target}!")
    except Exception as final_err:
        print(f"[EMAIL DISPATCH CRITICAL ERROR] All email dispatch attempts failed for {masked_target}: {final_err}. OTP logged above.")
