import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List
from app.core.config import settings


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
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Interview Invitation</h1>
            <p style="color: #e0e0e0; margin-top: 5px;">{company_name}</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
            <p>Dear Candidate,</p>
            <p>You are invited to attend an interview for the <strong>{job_role}</strong> position.</p>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>📅 Date:</strong> {date_str}</p>
                <p style="margin: 5px 0;"><strong>🕐 Time:</strong> {time_str}</p>
                <p style="margin: 5px 0;"><strong>⏱️ Duration:</strong> {session.get('duration_minutes', 30)} minutes</p>
            </div>

            <p>Please join the interview using the link below at the scheduled time:</p>

            <div style="text-align: center; margin: 25px 0;">
                <a href="{interview_link}"
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                          color: white; padding: 14px 30px; text-decoration: none;
                          border-radius: 8px; font-size: 16px; font-weight: bold;">
                    Join Interview
                </a>
            </div>

            <p style="color: #666; font-size: 13px;">
                If the button doesn't work, copy this link:<br/>
                <a href="{interview_link}">{interview_link}</a>
            </p>

            <hr style="border: 1px solid #eee; margin: 20px 0;"/>
            <p style="color: #999; font-size: 12px;">
                This is a unique link generated for you. Please do not share it.<br/>
                The interview will be conducted by our AI interviewer. You will receive questions one at a time and can type your responses.
            </p>
        </div>
    </body>
    </html>
    """

    message = MIMEMultipart("alternative")
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message["Subject"] = subject

    plain_text = f"""Dear Candidate,

You are invited to attend the interview for the {job_role} position at {company_name}.

Date: {date_str}
Time: {time_str}
Duration: {session.get('duration_minutes', 30)} minutes

Join Link: {interview_link}

Please ensure you have a stable internet connection.
The interview will be conducted by our AI interviewer.

Best regards,
{company_name}
"""
    message.attach(MIMEText(plain_text, "plain"))
    message.attach(MIMEText(html_body, "html"))

    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            start_tls=True,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
        )
        print(f"✅ Email sent to {to_email}")
    else:
        print(f"⚠️ SMTP not configured. Skipping email to {to_email}")
        print(f"   Interview link: {interview_link}")
