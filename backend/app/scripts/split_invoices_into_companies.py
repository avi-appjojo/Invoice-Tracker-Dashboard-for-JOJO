"""Utility script to split existing invoices evenly
between two companies: "JOJO" and "Navkar".

Usage (from backend folder):

    python -m app.scripts.split_invoices_into_companies

This will:
- Find invoices with no company assigned (company_name missing,
  null, or "Unassigned").
- Shuffle them randomly.
- Assign them alternately to "JOJO" and "Navkar" so that
  the counts are as even as possible.
"""

import asyncio
import random
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db


async def split_invoices(db: AsyncIOMotorDatabase) -> None:
    # Find invoices that don't yet have a real company name
    cursor = db["invoices"].find(
        {
            "$or": [
                {"company_name": {"$exists": False}},
                {"company_name": None},
                {"company_name": ""},
                {"company_name": "Unassigned"},
            ]
        }
    )

    docs: list[dict[str, Any]] = await cursor.to_list(length=None)
    total = len(docs)
    if total == 0:
        print("No unassigned invoices found.")
        return

    print(f"Found {total} unassigned invoices. Splitting between JOJO and Navkar…")

    # Shuffle them for randomness
    random.shuffle(docs)

    jojo = navkar = 0
    for idx, doc in enumerate(docs):
        company = "JOJO" if idx % 2 == 0 else "Navkar"
        await db["invoices"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"company_name": company}},
        )
        if company == "JOJO":
            jojo += 1
        else:
            navkar += 1

    print(f"Done. Assigned {jojo} invoices to JOJO and {navkar} to Navkar.")


async def main() -> None:
    db = get_db()
    await split_invoices(db)


if __name__ == "__main__":
    asyncio.run(main())

