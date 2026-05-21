"""
Resolve notification recipients from MongoDB users collection (by department and creator).
"""

from __future__ import annotations

from typing import Optional

from app.database import get_db


async def get_emails_by_department(department: str) -> list[str]:
    """
    Return list of email addresses for active users in the given department.
    Department is normalized to lowercase to match stored values.
    """
    if not department or not str(department).strip():
        return []
    db = get_db()
    dept = str(department).strip().lower()
    cursor = db["users"].find(
        {"department": dept, "status": "active"},
        {"email": 1},
    )
    emails: list[str] = []
    async for doc in cursor:
        email = (doc.get("email") or "").strip()
        if email:
            emails.append(email)
    return emails


async def get_creator_email(created_by_user_id: Optional[str]) -> Optional[str]:
    """Return email for the user with the given _id, or None if not found/inactive."""
    if not created_by_user_id or not str(created_by_user_id).strip():
        return None
    db = get_db()
    doc = await db["users"].find_one(
        {"_id": str(created_by_user_id).strip(), "status": "active"},
        {"email": 1},
    )
    if not doc:
        return None
    email = (doc.get("email") or "").strip()
    return email if email else None
