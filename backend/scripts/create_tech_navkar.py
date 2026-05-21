"""
One-off helper to create:
- A tech-department user: appmanager@appjojo.in (name: Bhavin)
- A sample Navkar invoice assigned to that user and tech department.

Run from backend folder:
    python scripts/create_tech_navkar.py
"""

from __future__ import annotations

import uuid
from datetime import datetime, date, timezone

from pymongo import MongoClient

from app.config import get_settings
from app.services.security import hash_password
from app.models.schemas import SheetStatus


def main() -> None:
    settings = get_settings()
    client = MongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]

    email = "appmanager@appjojo.in"
    name = "Bhavin"
    department = "tech"

    users = db["users"]
    invoices = db["invoices"]

    user = users.find_one({"email": email})
    if user:
        user_id = str(user["_id"])
    else:
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "_id": user_id,
            "name": name,
            "email": email,
            "password_hash": hash_password("test123!@#"),
            "role": "employee",
            "status": "active",
            "department": department,
            "created_at": now,
        }
        users.insert_one(doc)
        user = doc

    inv_id = str(uuid.uuid4())
    today = date.today().isoformat()
    now_ts = datetime.now(timezone.utc).isoformat()
    sheet_status = SheetStatus.PENDING.value
    invoice = {
        "_id": inv_id,
        "invoice_number": "NAVKAR-TEST-001",
        "vendor_name": "Sample Vendor",
        "company_name": "Navkar",
        "total_amount": 1000.0,
        "currency": "INR",
        "description": "Test invoice created for tech department flow",
        "due_date": today,
        "upload_date": today,
        "sheet_status": sheet_status,
        "payment_status": "unpaid",
        "pay_cycle": "30",
        "priority": "medium",
        "created_by": user_id,
        "created_by_name": name,
        "department": department,
        "created_at": now_ts,
        "updated_at": now_ts,
    }
    invoices.insert_one(invoice)

    print(f"User ensured: {email} (id={user_id}, department={department})")
    print(f"Invoice created: {inv_id} for company=Navkar")


if __name__ == "__main__":
    main()

