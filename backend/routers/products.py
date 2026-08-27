from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import SUPER_ADMIN, current_user, require_roles, write_audit
from lib.db import db
from lib.ids import next_code
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/products", tags=["products"])

LIST_PROJECTION = {
    "_id": 0,
    "product_id": 1,
    "product_code": 1,
    "product_name": 1,
    "brand": 1,
    "category": 1,
    "unit": 1,
    "default_price": 1,
    "supplier": 1,
    "distributor": 1,
    "status": 1,
}
SORTABLE = ["product_name", "product_code", "default_price", "category", "created_date"]


class ProductIn(BaseModel):
    product_code: Optional[str] = None
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    unit: str = "Unit"
    default_price: float = 0
    supplier: Optional[str] = None
    distributor: Optional[str] = None
    status: str = "Active"


class ProductRow(BaseModel):
    product_id: str
    product_code: Optional[str] = None
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    unit: str = "Unit"
    default_price: float = 0
    supplier: Optional[str] = None
    distributor: Optional[str] = None
    status: str = "Active"


class ProductListResponse(BaseModel):
    data: list[ProductRow]
    total: int
    page: int
    page_size: int


@router.get("/options", response_model=list[ProductRow])
async def product_options(search: Optional[str] = None, _: dict = Depends(current_user)):
    query: dict = {"status": "Active"}
    query.update(search_clause(search, ["product_name", "product_code", "brand"]))
    rows = await db.products.find(query, LIST_PROJECTION).sort([("product_name", 1)]).to_list(50)
    return [ProductRow(**r) for r in rows]


@router.get("", response_model=ProductListResponse)
async def list_products(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    _: dict = Depends(current_user),
):
    query: dict = {}
    query.update(search_clause(search, ["product_name", "product_code", "brand", "supplier"]))
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    result = await paginate(
        db.products, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "created_date"),
    )
    return ProductListResponse(**result)


@router.post("", response_model=ProductRow)
async def create_product(payload: ProductIn, user: dict = Depends(require_roles(SUPER_ADMIN))):
    now = datetime.now(timezone.utc)
    pid = await next_code("PRD")
    doc = payload.model_dump()
    doc.update(
        {
            "product_id": pid,
            "product_code": payload.product_code or pid,
            "created_date": now,
            "updated_date": now,
        }
    )
    await db.products.insert_one(dict(doc))
    await write_audit(user, "CREATE", "Product", pid, None, payload.product_name)
    return ProductRow(**doc)


@router.put("/{product_id}", response_model=ProductRow)
async def update_product(product_id: str, payload: ProductIn, user: dict = Depends(require_roles(SUPER_ADMIN))):
    existing = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_date"] = datetime.now(timezone.utc)
    await db.products.update_one({"product_id": product_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Product", product_id, existing.get("product_name"), updates.get("product_name"))
    return ProductRow(**{**existing, **updates})


@router.delete("/{product_id}")
async def archive_product(product_id: str, user: dict = Depends(require_roles(SUPER_ADMIN))):
    res = await db.products.update_one({"product_id": product_id}, {"$set": {"status": "Archived"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    await write_audit(user, "ARCHIVE", "Product", product_id, "Active", "Archived")
    return {"ok": True}
