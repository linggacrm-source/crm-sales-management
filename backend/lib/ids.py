"""Human-readable sequential ids via an atomic Mongo counter."""

from datetime import datetime, timezone

from lib.db import db


async def next_seq(name: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return int(doc["seq"])


async def next_code(prefix: str, name: str | None = None, width: int = 4) -> str:
    n = await next_seq(name or prefix)
    return f"{prefix}-{n:0{width}d}"


async def next_yearly_code(prefix: str, width: int = 4) -> str:
    year = datetime.now(timezone.utc).year
    n = await next_seq(f"{prefix}-{year}")
    return f"{prefix}-{year}-{n:0{width}d}"


def sales_initial(name: str | None) -> str:
    """Sales initial for the quotation number: first two letters of the first name (Aripin -> AR)."""
    first = (name or "").strip().split(" ")[0] if name else ""
    letters = "".join(ch for ch in first if ch.isalpha())
    return (letters[:2] or "XX").upper()


async def next_quotation_number(sales_name: str | None) -> str:
    """QUO/YYYY/<SALES INITIAL>/XXXX — running number is sequential and unique per year."""
    year = datetime.now(timezone.utc).year
    n = await next_seq(f"QUO-{year}")
    return f"QUO/{year}/{sales_initial(sales_name)}/{n:04d}"
