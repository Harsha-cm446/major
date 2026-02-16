"""
Email Service — Supports Resend (HTTPS API) and SMTP fallback
──────────────────────────────────────────────────────────────
Priority: Resend > SMTP. Resend works on all hosting platforms
including those that block outbound SMTP (Render, Vercel, etc.)

Setup:
  Resend: Set RESEND_API_KEY in .env (free at https://resend.com)
  SMTP:   Set SMTP_USER + SMTP_PASSWORD in .env
"""

import httpx
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List
from app.core.config import settings


# ── Provider Selection ────────────────────────────────

def _get_email_provider() -> str:
    """Determine which email provider to use."""
    if settings.EMAIL_PROVIDER == "resend":
        return "resend"
    if settings.EMAIL_PROVIDER == "smtp":
        return "smtp"
    # Auto-detect: prefer Resend if API key is set
    if settings.RESEND_API_KEY:
        return "resend"
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        return "smtp"
    return "none"


# ── Resend (HTTPS API) ───────────────────────────────

async def _send_via_resend(to_email: str, subject: str, html_body: str, plain_text: str):
    """Send email via Resend HTTPS API — works everywhere, no SMTP port needed."""
    # Resend free tier only allows sending from onboarding@resend.dev
    # To use a custom domain, verify it in the Resend dashboard first
    from_address = "AI Interview Platform <onboarding@resend.dev>"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": from_address,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
                "text": plain_text,
            },
        )
        if resp.status_code not in (200, 201):
            raise Exception(f"Resend API error {resp.status_code}: {resp.text}")


# ── SMTP Fallback ─────────────────────────────────────

async def _send_via_smtp(to_email: str, subject: str, html_body: str, plain_text: str):
    """Send email via SMTP — works on local machines and hosts that allow port 587."""
    message = MIMEMultipart("alternative")
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(plain_text, "plain"))
    message.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        start_tls=True,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
    )


# ── Unified Send ─────────────────────────────────────

async def _send_email(to_email: str, subject: str, html_body: str, plain_text: str):
    """Send an email using the configured provider, with auto-fallback."""
    provider = _get_email_provider()

    if provider == "resend":
        try:
            await _send_via_resend(to_email, subject, html_body, plain_text)
            print(f"✅ Email sent to {to_email} (via Resend)")
            return
        except Exception as e:
            print(f"⚠️ Resend failed for {to_email}: {e}")
            # Auto-fallback to SMTP if configured
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                print(f"   Falling back to SMTP...")
                try:
                    await _send_via_smtp(to_email, subject, html_body, plain_text)
                    print(f"✅ Email sent to {to_email} (via SMTP fallback)")
                    return
                except Exception as smtp_err:
                    print(f"❌ SMTP fallback also failed: {smtp_err}")
            raise
    elif provider == "smtp":
        await _send_via_smtp(to_email, subject, html_body, plain_text)
        print(f"✅ Email sent to {to_email} (via SMTP)")
    else:
        print(f"⚠️ No email provider configured. Skipping email to {to_email}")
        print(f"   Set RESEND_API_KEY or SMTP_USER/SMTP_PASSWORD in .env")


# ── Public API ────────────────────────────────────────

async def send_interview_invitations(candidates: list, session: dict, company_name: str):
    """Send invitation emails to all candidates for an interview session."""
    for candidate in candidates:
        try:
            await _send_single_invite(
                to_email=candidate.email,
                unique_token=candidate.unique_token,
                session=session,
                company_name=company_name,
            )
        except Exception as e:
            print(f"Failed to send email to {candidate.email}: {e}")


async def _send_single_invite(to_email: str, unique_token: str, session: dict, company_name: str):
    """Send a single invitation email."""
    base_url = settings.PUBLIC_URL or settings.FRONTEND_URL
    interview_link = f"{base_url}/interview/{unique_token}"
    scheduled = session.get("scheduled_time")
    date_str = scheduled.strftime("%B %d, %Y") if scheduled else "TBD"
    time_str = scheduled.strftime("%I:%M %p") if scheduled else "TBD"
    job_role = session.get("job_role", "Position")

    subject = f"Interview Invitation – {company_name}"

    html_body = f"""
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; border-radius: 16px 16px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Interview Invitation</h1>
            <p style="color: #e0d4f5; margin-top: 8px; font-size: 16px;">{company_name}</p>
        </div>
        <div style="background: #ffffff; padding: 36px 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #334155; font-size: 16px; line-height: 1.6;">Dear Candidate,</p>
            <p style="color: #334155; font-size: 16px; line-height: 1.6;">
                You are invited to attend an AI-powered interview for the <strong style="color: #1e293b;">{job_role}</strong> position.
            </p>

            <div style="background: #f1f5f9; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #667eea;">
                <p style="margin: 6px 0; color: #475569; font-size: 15px;"><strong>📅 Date:</strong> {date_str}</p>
                <p style="margin: 6px 0; color: #475569; font-size: 15px;"><strong>🕐 Time:</strong> {time_str}</p>
                <p style="margin: 6px 0; color: #475569; font-size: 15px;"><strong>⏱️ Duration:</strong> {session.get('duration_minutes', 30)} minutes</p>
            </div>

            <p style="color: #334155; font-size: 16px; line-height: 1.6;">Please join the interview using the link below at the scheduled time:</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{interview_link}"
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                          color: white; padding: 16px 36px; text-decoration: none;
                          border-radius: 12px; font-size: 16px; font-weight: 600;
                          display: inline-block; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                    Join Interview →
                </a>
            </div>

            <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
                If the button doesn't work, copy this link:<br/>
                <a href="{interview_link}" style="color: #667eea; word-break: break-all;">{interview_link}</a>
            </p>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>

            <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin-top: 8px;">
                <p style="color: #1e40af; font-size: 13px; margin: 0; font-weight: 600;">💡 Tips for your interview:</p>
                <ul style="color: #3b82f6; font-size: 13px; margin: 8px 0 0; padding-left: 20px; line-height: 1.8;">
                    <li>Ensure a stable internet connection</li>
                    <li>Use a quiet room with good lighting</li>
                    <li>Have your camera and microphone ready</li>
                    <li>This is an AI-powered interview — answer clearly and concisely</li>
                </ul>
            </div>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                This is a unique link generated for you. Please do not share it.
            </p>
        </div>
    </body>
    </html>
    """

    plain_text = f"""Dear Candidate,

You are invited to attend the interview for the {job_role} position at {company_name}.

Date: {date_str}
Time: {time_str}
Duration: {session.get('duration_minutes', 30)} minutes

Join Link: {interview_link}

Tips:
- Ensure a stable internet connection
- Use a quiet room with good lighting
- Have your camera and microphone ready
- This is an AI-powered interview — answer clearly and concisely

Best regards,
{company_name}
"""

    await _send_email(to_email, subject, html_body, plain_text)
