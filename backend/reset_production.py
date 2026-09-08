"""One-time production CRM reset. This script is intentionally not imported by the app."""

import asyncio
import os

from lib.db import db

KEEP_USER_IDS = {"USR-0001", "USR-0002", "USR-0003"}
CRM_COLLECTIONS = [
    "customers",
    "products",
    "opportunities",
    "quotations",
    "purchase_orders",
    "order_monitoring",
    "activities",
    "audit_logs",
    "counters",
]


async def main() -> None:
    if os.getenv("CRM_PRODUCTION_RESET") != "CONFIRMED":
        raise RuntimeError("CRM_PRODUCTION_RESET must be CONFIRMED")

    for collection in CRM_COLLECTIONS:
        await db[collection].delete_many({})

    await db.users.delete_many({"user_id": {"$nin": sorted(KEEP_USER_IDS)}})
    await db.counters.update_one(
        {"_id": "USR"},
        {"$set": {"seq": len(KEEP_USER_IDS)}},
        upsert=True,
    )

    counts = {
        collection: await db[collection].count_documents({})
        for collection in [*CRM_COLLECTIONS, "users"]
    }
    print("Production CRM reset complete:", counts)


if __name__ == "__main__":
    asyncio.run(main())
