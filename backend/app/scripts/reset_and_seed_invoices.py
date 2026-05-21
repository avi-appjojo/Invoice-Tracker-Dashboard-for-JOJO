"""Reset invoices collection and seed demo data.

This script will:
- Delete ALL existing invoices.
- Insert demo invoices for two companies (JOJO, Navkar),
  each with 4 vendors and 6 invoices (12 total).

Run from the backend folder:

    python -m app.scripts.reset_and_seed_invoices
"""

import asyncio
from datetime import date
from typing import Any

from app.database import get_db


async def reset_and_seed() -> None:
    db = get_db()
    invoices = db["invoices"]

    print("Removing all existing invoices…")
    await invoices.delete_many({})

    companies = {
        "JOJO": ["Apex Packaging", "Bright Media", "Green Farms", "Nova Prints"],
        "Navkar": ["Apex Packaging", "Bright Media", "Green Farms", "Nova Prints"],
    }

    demo_rows: list[dict[str, Any]] = []

    amounts = [15000, 24500, 40500, 49000, 31500, 66000]
    sheet_statuses = [
        "Pending",
        "Pending",
        "Approved for Release",
        "Pending",
        "Approved for Release",
        "On Hold",
    ]

    inv_counter = 1001
    for company, vendor_list in companies.items():
        # 6 invoices per company
        for i in range(6):
            vendor = vendor_list[i % len(vendor_list)]
            total_amount = float(amounts[i])
            sheet_status = sheet_statuses[i]

            doc: dict[str, Any] = {
                "invoice_number": f"INV-{inv_counter}",
                "vendor_name": vendor,
                "company_name": company,
                "total_amount": total_amount,
                "currency": "INR",
                "sheet_status": sheet_status,
                "upload_date": date.today().isoformat(),
                "payment_status": "paid" if sheet_status == "Paid" else "unpaid",
            }
            demo_rows.append(doc)
            inv_counter += 1

    if not demo_rows:
        print("Nothing to insert.")
        return

    print(f"Inserting {len(demo_rows)} demo invoices…")
    await invoices.insert_many(demo_rows)
    print("Done seeding demo invoices.")


async def main() -> None:
    await reset_and_seed()


if __name__ == "__main__":
    asyncio.run(main())

