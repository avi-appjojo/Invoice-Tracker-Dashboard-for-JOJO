from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def ensure_db_indexes(db: AsyncIOMotorDatabase) -> None:
    """
    Create indexes used by list/dashboard queries.
    Safe to call multiple times; Mongo will no-op if indexes already exist.
    """
    try:
        # Invoices: common filters/sorts
        await db["invoices"].create_index([("created_at", -1)])
        await db["invoices"].create_index([("due_date", 1)])
        await db["invoices"].create_index([("payment_status", 1), ("due_date", 1)])
        await db["invoices"].create_index([("sheet_status", 1), ("created_at", -1)])
        await db["invoices"].create_index([("department", 1), ("created_at", -1)])
        await db["invoices"].create_index([("company_name", 1), ("created_at", -1)])
        await db["invoices"].create_index([("vendor_name", 1), ("created_at", -1)])
        await db["invoices"].create_index([("deleted_at", 1)])

        # Users: recipients lookup + admin lists
        await db["users"].create_index([("department", 1), ("status", 1)])
        await db["users"].create_index([("created_at", -1)])

        # Vendors/Companies: list sorting
        await db["vendors"].create_index([("vendor_name", 1)])
        await db["companies"].create_index([("name", 1)])

        # Payments: invoice lookup
        await db["payments"].create_index([("invoice_id", 1), ("created_at", -1)])

        logger.info("MongoDB indexes ensured")
    except Exception as e:
        # Non-fatal: app should still run
        logger.warning("Failed to create MongoDB indexes: %s", e)

