"""
Email service: send emails via Gmail API using credentials from gmail_oauth.
Gmail only allows sending from the authenticated account; we use the profile
email as From when GMAIL_SENDER_EMAIL is unset or to avoid sender rejection.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from email.mime.text import MIMEText

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import get_settings
from app.services.gmail_oauth import get_credentials

logger = logging.getLogger(__name__)


def _get_authenticated_email(service) -> str | None:
    """Get the authenticated Gmail account's email (for From header). Returns None on failure."""
    try:
        profile = service.users().getProfile(userId="me").execute()
        return (profile.get("emailAddress") or "").strip() or None
    except Exception as e:
        logger.warning("Could not get Gmail profile (emailAddress): %s", e)
        return None


def _send_email_sync(to_emails: list[str], subject: str, body_html: str) -> None:
    """Synchronous send (run in executor)."""
    if not to_emails:
        return
    creds = get_credentials()
    if not creds:
        logger.warning("Cannot send email: Gmail credentials not available. Run scripts/gmail_oauth_setup.py and ensure gmail_tokens.json exists.")
        return
    settings = get_settings()
    configured_sender = (settings.GMAIL_SENDER_EMAIL or "").strip() or None

    message = MIMEText(body_html, "html", "utf-8")
    message["To"] = ", ".join(to_emails)
    message["Subject"] = subject

    try:
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        # Gmail only allows sending from the authenticated account. Use profile email as From
        # so we never get "Sender address rejected". If GMAIL_SENDER_EMAIL is set and matches
        # the account, we could use it; otherwise we must use the profile email.
        profile_email = _get_authenticated_email(service)
        if profile_email:
            message["From"] = profile_email
        elif configured_sender:
            message["From"] = configured_sender
        else:
            message["From"] = "noreply@jojo.in"
            logger.warning("Gmail profile email not available; using fallback From. Emails may fail if Gmail rejects the sender.")

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        logger.info("Email sent to %s (From: %s): %s", to_emails, message["From"], subject)
    except HttpError as e:
        err_detail = getattr(e, "content", None) or str(e)
        logger.exception("Gmail API error (status %s): %s", getattr(e, "status_code", ""), err_detail)
        raise
    except Exception as e:
        logger.exception("Gmail send failed: %s", e)
        raise


async def send_email(to_emails: list[str], subject: str, body_html: str) -> None:
    """
    Send an email via Gmail API. Runs in a thread so it does not block.
    Logs and swallows errors so callers are not affected.
    """
    if not to_emails:
        return
    to_emails = [e.strip() for e in to_emails if e and e.strip()]
    if not to_emails:
        return
    try:
        await asyncio.to_thread(_send_email_sync, to_emails, subject, body_html)
    except HttpError as e:
        logger.exception(
            "Gmail email send failed (non-fatal). Status %s: %s",
            getattr(e, "status_code", ""),
            getattr(e, "content", str(e)),
        )
    except Exception as e:
        logger.exception("Gmail email send failed (non-fatal): %s", e)
