"""
Cleanup helper:
- For company 'Navkar' and vendor 'Sample Vendor' with invoice_number 'NAVKAR-TEST-001',
  keep the oldest invoice and delete all newer duplicates.

Run from backend:
    python -m scripts.cleanup_navkar_invoices
"""

from __future__ import annotations

from pymongo import MongoClient

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    client = MongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]
    coll = db["invoices"]

    query = {
        "company_name": "Navkar",
        "vendor_name": "Sample Vendor",
        "invoice_number": "NAVKAR-TEST-001",
    }
    docs = list(coll.find(query).sort("created_at", 1))
    print("Found", len(docs), "matching Navkar test invoices")
    if len(docs) <= 1:
        print("Nothing to clean up")
        return

    keep_id = docs[0]["_id"]
    delete_ids = [d["_id"] for d in docs[1:]]
    coll.delete_many({"_id": {"$in": delete_ids}})
    print("Keeping", keep_id, "deleted", delete_ids)


if __name__ == "__main__":
    main()

