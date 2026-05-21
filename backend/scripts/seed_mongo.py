"""
Seed MongoDB with a fresh, controlled dataset:

- Drop and recreate the entire application database.
- Create admin + employee users.
- Create exactly 2 companies.
- Create exactly 5 vendors per company (10 total).
- Create exactly 7 invoices per company (14 total) with mixed statuses.
"""

from datetime import datetime, timedelta, timezone
import random
import uuid

from pymongo import MongoClient

from app.config import get_settings
from app.services.security import hash_password
from app.models.schemas import SheetStatus


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def main() -> None:
    settings = get_settings()
    client = MongoClient(settings.MONGODB_URI)

    # Drop and recreate the whole DB
    client.drop_database(settings.MONGODB_DB_NAME)
    db = client[settings.MONGODB_DB_NAME]

    users = db["users"]
    invoices = db["invoices"]
    payments = db["payments"]
    companies = db["companies"]
    vendors = db["vendors"]

    now = datetime.now(timezone.utc)

    # Users -----------------------------------------------------------------
    admin_email = "appmanager@appjojo.in"
    employee_email = "employee@jojo.in"

    admin_id = str(uuid.uuid4())
    employee_id = str(uuid.uuid4())

    users.insert_many(
        [
            {
                "_id": admin_id,
                "name": "Admin",
                "email": admin_email,
                "password_hash": hash_password("admin123!@#"),
                "role": "admin",
                "status": "active",
                "created_at": iso(now),
            },
            {
                "_id": employee_id,
                "name": "Employee",
                "email": employee_email,
                "password_hash": hash_password("employee123!@#"),
                "role": "employee",
                "status": "active",
                "created_at": iso(now),
            },
        ]
    )

    # Companies --------------------------------------------------------------
    company_defs = [
        {"name": "JOJO", "display_name": "JOJO"},
        {"name": "Navkar", "display_name": "Navkar"},
    ]

    company_ids: dict[str, str] = {}
    for c in company_defs:
        cid = str(uuid.uuid4())
        company_ids[c["name"]] = cid
        companies.insert_one(
            {
                "_id": cid,
                "name": c["name"],
                "display_name": c["display_name"],
                "is_active": True,
                "created_by": admin_id,
                "created_at": iso(now),
                "updated_at": iso(now),
            }
        )

    # Vendors ----------------------------------------------------------------
    vendor_names = {
        "JOJO": [
            "Apex Packaging",
            "Green Farms",
            "Nova Prints",
            "Zen Office",
            "Bright Media",
        ],
        "Navkar": [
            "Cloud IT Services",
            "Metro Supplies",
            "Shree Logistics",
            "Pixel Studios",
            "Urban Catering",
        ],
    }

    for company_name, vnames in vendor_names.items():
        for vn in vnames:
            vendors.insert_one(
                {
                    "_id": str(uuid.uuid4()),
                    "vendor_name": vn,
                    "category": "General",
                    "status": "active",
                    "created_at": iso(now),
                    "company_name": company_name,
                }
            )

    # Invoices ---------------------------------------------------------------
    # Status pool: random but ensures all values appear across data.
    status_pool = [
        SheetStatus.PENDING.value,
        SheetStatus.APPROVED_FOR_RELEASE.value,
        SheetStatus.ON_HOLD.value,
        SheetStatus.PAID.value,
    ]

    all_invoices = []
    payment_docs = []

    inv_counter = 1001

    random.seed(42)

    for company_name, vnames in vendor_names.items():
        for idx in range(7):  # 7 invoices per company
            invoice_id = str(uuid.uuid4())
            vendor_name = random.choice(vnames)
            status = random.choice(status_pool)

            created_at = now - timedelta(days=idx + (0 if company_name == "JOJO" else 7))
            due_date = created_at.date() + timedelta(days=15 + idx)

            description = None
            if idx % 2 == 0:
                description = f"Invoice for {vendor_name} services (#{inv_counter})"

            doc = {
                "_id": invoice_id,
                "invoice_number": f"INV-{inv_counter}",
                "vendor_name": vendor_name,
                "company_name": company_name,
                "total_amount": 15000 + idx * 5500,
                "upload_date": created_at.date().isoformat(),
                "due_date": due_date.isoformat(),
                "pay_cycle": random.choice(["15", "30", "60", "90"]),
                "description": description,
                "sheet_status": status,
                "payment_status": "unpaid" if status != SheetStatus.PAID.value else "paid",
                "created_by": employee_id,
                "created_at": iso(created_at),
                "updated_at": iso(created_at),
            }

            if status in (SheetStatus.APPROVED_FOR_RELEASE.value, SheetStatus.PAID.value):
                approved_at = created_at + timedelta(days=1)
                doc["approved_at"] = iso(approved_at)
                doc["approved_by"] = admin_id
                doc["updated_at"] = iso(approved_at)

            if status == SheetStatus.PAID.value:
                paid_at = created_at + timedelta(days=2)
                doc["paid_at"] = iso(paid_at)
                doc["paid_by"] = employee_id
                doc["updated_at"] = iso(paid_at)
                payment_docs.append(
                    {
                        "_id": str(uuid.uuid4()),
                        "invoice_id": invoice_id,
                        "amount_paid": doc["total_amount"],
                        "payment_method": "bank_transfer",
                        "reference_number": f"UTR-{inv_counter}",
                        "payment_date": paid_at.date().isoformat(),
                        "notes": f"Auto payment for {doc['invoice_number']}",
                        "marked_by": employee_id,
                        "created_at": iso(paid_at),
                    }
                )

            all_invoices.append(doc)
            inv_counter += 1

    invoices.insert_many(all_invoices)
    if payment_docs:
        payments.insert_many(payment_docs)

    print("Database reset and seeded with:")
    print("- 2 companies")
    print("- 10 vendors (5 per company)")
    print("- 14 invoices (7 per company) with mixed statuses")
    print("- Admin user:", admin_email)
    print("- Employee user:", employee_email)


if __name__ == "__main__":
    main()

