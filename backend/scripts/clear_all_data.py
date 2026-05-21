"""
Delete all business data from the backend database:
  - All invoices
  - All companies
  - All vendors
  - All payments

Users are NOT deleted so you can still log in.

Run from the project root:

    python backend/scripts/clear_all_data.py

Or from the backend folder:

    python scripts/clear_all_data.py
"""

import asyncio
import sys
from pathlib import Path

# Allow running from project root or backend folder (so "app" can be imported)
_root = Path(__file__).resolve().parent
if _root.name == "scripts":
    _root = _root.parent  # backend
if _root.name == "backend":
    _root = _root.parent  # project root; then we need backend on path
    _backend = _root / "backend"
    if str(_backend) not in sys.path:
        sys.path.insert(0, str(_backend))
elif str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from app.database import get_db


async def clear_all() -> None:
    db = get_db()
    collections = [
        ("invoices", "Invoices"),
        ("payments", "Payments"),
        ("vendors", "Vendors"),
        ("companies", "Companies"),
    ]
    for coll_name, label in collections:
        coll = db[coll_name]
        count_before = await coll.count_documents({})
        await coll.delete_many({})
        print(f"  {label}: deleted {count_before} document(s)")
    print("Done. All invoices, payments, vendors, and companies have been removed.")
    print("Users were kept so you can still log in.")


def main() -> None:
    print("Clearing all invoices, payments, vendors, and companies...")
    asyncio.run(clear_all())


if __name__ == "__main__":
    main()
