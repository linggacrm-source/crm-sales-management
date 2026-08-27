"""Server-side pagination / search / sort helpers — every list endpoint goes through here."""

import asyncio
import re
from typing import Any, Optional

MAX_PAGE_SIZE = 100


def clamp_page(page: int, page_size: int) -> tuple[int, int]:
    page = max(1, page)
    page_size = min(max(1, page_size), MAX_PAGE_SIZE)
    return page, page_size


def search_clause(search: Optional[str], fields: list[str]) -> dict:
    if not search or not search.strip():
        return {}
    rx = re.escape(search.strip())
    return {"$or": [{f: {"$regex": rx, "$options": "i"}} for f in fields]}


def sort_spec(sort_by: Optional[str], sort_dir: Optional[str], allowed: list[str], default: str) -> list[tuple[str, int]]:
    field = sort_by if sort_by in allowed else default
    direction = -1 if (sort_dir or "desc").lower() == "desc" else 1
    return [(field, direction)]


async def paginate(
    collection,
    query: dict,
    page: int,
    page_size: int,
    projection: dict[str, Any],
    sort: list[tuple[str, int]],
) -> dict:
    """Count + one page of documents, run concurrently. Projection keeps the response small."""
    page, page_size = clamp_page(page, page_size)
    cursor = collection.find(query, projection).sort(sort).skip((page - 1) * page_size).limit(page_size)
    total, data = await asyncio.gather(
        collection.count_documents(query),
        cursor.to_list(page_size),
    )
    return {"data": data, "total": total, "page": page, "page_size": page_size}
