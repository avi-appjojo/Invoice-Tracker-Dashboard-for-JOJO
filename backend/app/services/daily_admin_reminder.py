"""
Daily admin report: one email Mon–Sat 12:00 Asia/Kolkata with
Today's Invoices, Total Invoices, Critical Priority, High Priority, and URL (all values in bold).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Any

from app.config import get_settings
from app.database import get_db
from app.services.email_service import send_email

logger = logging.getLogger(__name__)

TZ_KOLKATA = ZoneInfo("Asia/Kolkata")


async def _today_invoices_count() -> int:
    """Count invoices created today (calendar day in Asia/Kolkata)."""
    tz = TZ_KOLKATA
    now = datetime.now(tz)
    today = now.date()
    start_k = datetime(today.year, today.month, today.day, 0, 0, 0, 0, tzinfo=tz)
    end_k = datetime(today.year, today.month, today.day, 23, 59, 59, 999_999, tzinfo=tz)
    start_utc = start_k.astimezone(timezone.utc).isoformat()
    end_utc = end_k.astimezone(timezone.utc).isoformat()

    db = get_db()
    q: dict[str, Any] = {
        "created_at": {"$gte": start_utc, "$lte": end_utc},
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    return await db["invoices"].count_documents(q)


async def _total_invoices_count() -> int:
    """Total invoices (excluding soft-deleted)."""
    db = get_db()
    q: dict[str, Any] = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    return await db["invoices"].count_documents(q)


async def _critical_priority_count() -> int:
    """Invoices with priority = critical (stored field)."""
    db = get_db()
    q: dict[str, Any] = {
        "priority": {"$regex": "^critical$", "$options": "i"},
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    return await db["invoices"].count_documents(q)


async def _high_priority_count() -> int:
    """Invoices with priority = high (stored field)."""
    db = get_db()
    q: dict[str, Any] = {
        "priority": {"$regex": "^high$", "$options": "i"},
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    return await db["invoices"].count_documents(q)


def _build_report_html(today_count: int, total_count: int, critical_count: int, high_count: int, system_url: str) -> str:
    """Build HTML body with all values in bold."""
    return (
        "<p>Daily Invoice Report</p>"
        "<p>Today's Invoices: <strong>{}</strong></p>"
        "<p>Total Invoices: <strong>{}</strong></p>"
        "<p>Critical Priority: <strong>{}</strong></p>"
        "<p>High Priority: <strong>{}</strong></p>"
        "<p>URL: <strong>{}</strong></p>"
    ).format(today_count, total_count, critical_count, high_count, system_url or "—")


async def _get_report_recipients() -> list[str]:
    """Admin report recipients: ADMIN_REPORT_EMAIL if set, else all active admin/superadmin emails."""
    settings = get_settings()
    email = (settings.ADMIN_REPORT_EMAIL or "").strip()
    if email:
        return [email]
    db = get_db()
    cursor = db["users"].find(
        {"role": {"$in": ["admin", "superadmin"]}, "status": "active"},
        {"email": 1},
    )
    emails: list[str] = []
    async for u in cursor:
        e = (u.get("email") or "").strip()
        if e and e not in emails:
            emails.append(e)
    return emails


async def send_daily_admin_report() -> None:
    """
    Compute today/total/critical/high counts and system URL, then send one HTML email
    to admin(s) with all values in bold. Mon–Sat 12:00 Asia/Kolkata (scheduled in main.py).
    """
    try:
        recipients = await _get_report_recipients()
        if not recipients:
            logger.info("Daily admin report: no recipients (ADMIN_REPORT_EMAIL unset and no active admin/superadmin)")
            return

        today_count = await _today_invoices_count()
        total_count = await _total_invoices_count()
        critical_count = await _critical_priority_count()
        high_count = await _high_priority_count()
        settings = get_settings()
        system_url = (settings.SYSTEM_URL or "").strip() or "—"

        body_html = _build_report_html(today_count, total_count, critical_count, high_count, system_url)
        subject = "Daily Invoice Report"

        await send_email(recipients, subject, body_html)
        logger.info("Daily admin report sent to %s recipients", len(recipients))
    except Exception as e:
        logger.exception("send_daily_admin_report failed: %s", e)
