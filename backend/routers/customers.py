from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import SALES, current_user, scope_filter, visible_sales_ids, write_audit
from lib.db import db
from lib.ids import next_code
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/customers", tags=["customers"])

LIST_PROJECTION = {
    "_id": 0,
    "customer_id": 1,
    "customer_name": 1,
    "company": 1,
    "industry": 1,
    "city": 1,
    "phone": 1,
    "email": 1,
    "pic_name": 1,
    "sales_id": 1,
    "sales_name": 1,
    "status": 1,
}
SORTABLE = ["customer_name", "company", "city", "status", "created_date"]


class CustomerIn(BaseModel):
    customer_name: str
    company: Optional[str] = None
    industry: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    pic_name: Optional[str] = None
    pic_position: Optional[str] = None
    source: Optional[str] = None
    sales_id: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None


class CustomerRow(BaseModel):
    customer_id: str
    customer_name: str
    company: Optional[str] = None
    industry: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    pic_name: Optional[str] = None
    sales_id: Optional[str] = None
    sales_name: Optional[str] = None
    status: str = "Active"


class CustomerDetail(CustomerRow):
    address: Optional[str] = None
    province: Optional[str] = None
    pic_position: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    created_date: Optional[datetime] = None
    updated_date: Optional[datetime] = None


class CustomerListResponse(BaseModel):
    data: list[CustomerRow]
    total: int
    page: int
    page_size: int


class CustomerOption(BaseModel):
    customer_id: str
    customer_name: str
    company: Optional[str] = None


async def _sales_name(sales_id: Optional[str]) -> Optional[str]:
    if not sales_id:
        return None
    doc = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1})
    return doc["name"] if doc else None


@router.get("/options", response_model=list[CustomerOption])
async def customer_options(search: Optional[str] = None, user: dict = Depends(current_user)):
    query = await scope_filter(user)
    query.update(search_clause(search, ["customer_name", "company"]))
    rows = await db.customers.find(
        query, {"_id": 0, "customer_id": 1, "customer_name": 1, "company": 1}
    ).sort([("customer_name", 1)]).to_list(50)
    return [CustomerOption(**r) for r in rows]


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    industry: Optional[str] = None,
    sales_id: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user: dict = Depends(current_user),
):
    query = await scope_filter(user)
    query.update(search_clause(search, ["customer_name", "company", "pic_name", "email", "customer_id"]))
    if status:
        query["status"] = status
    if industry:
        query["industry"] = industry
    if sales_id:
        allowed = await visible_sales_ids(user)
        if allowed is not None and sales_id not in allowed:
            raise HTTPException(status_code=403, detail="Tidak memiliki akses ke data sales tersebut")
        query["sales_id"] = sales_id
    result = await paginate(
        db.customers, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "created_date"),
    )
    return CustomerListResponse(**result)


@router.get("/{customer_id}", response_model=CustomerDetail)
async def get_customer(customer_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.customers.find_one({"customer_id": customer_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Customer tidak ditemukan")
    return CustomerDetail(**doc)


# --- lazy-loaded related tabs: each fetched only when its tab is opened -------------
RELATED = {
    "pipeline": (
        "opportunities",
        {"_id": 0, "opportunity_id": 1, "opportunity_name": 1, "stage": 1, "value": 1,
         "weighted_value": 1, "expected_close_date": 1, "sales_name": 1},
    ),
    "quotations": (
        "quotations",
        {"_id": 0, "quotation_id": 1, "quotation_number": 1, "quotation_date": 1,
         "grand_total": 1, "status": 1, "sales_name": 1},
    ),
    "purchase-orders": (
        "purchase_orders",
        {"_id": 0, "po_id": 1, "po_number": 1, "po_date": 1, "po_value": 1, "status": 1, "sales_name": 1},
    ),
    "activities": (
        "activities",
        {"_id": 0, "activity_id": 1, "activity_type": 1, "activity_date": 1, "subject": 1,
         "status": 1, "next_followup": 1, "sales_name": 1},
    ),
    "order-monitoring": (
        "order_monitoring",
        {"_id": 0, "monitoring_id": 1, "po_number": 1, "product_name": 1, "qty": 1,
         "status": 1, "eta": 1, "supplier": 1},
    ),
}


class RelatedResponse(BaseModel):
    data: list[dict]
    total: int
    page: int
    page_size: int


@router.get("/{customer_id}/{resource}", response_model=RelatedResponse)
async def customer_related(
    customer_id: str,
    resource: str,
    page: int = 1,
    page_size: int = 10,
    user: dict = Depends(current_user),
):
    if resource not in RELATED:
        raise HTTPException(status_code=404, detail="Resource tidak dikenal")
    coll_name, projection = RELATED[resource]
    scope = await scope_filter(user)
    query = {"customer_id": customer_id, **scope}
    result = await paginate(
        db[coll_name], query, page, page_size, projection, [("created_date", -1)]
    )
    return RelatedResponse(**result)


@router.post("", response_model=CustomerDetail)
async def create_customer(payload: CustomerIn, user: dict = Depends(current_user)):
    sales_id = payload.sales_id or user["user_id"]
    if user["role"] == SALES:
        sales_id = user["user_id"]
    now = datetime.now(timezone.utc)
    doc = payload.model_dump()
    doc.update(
        {
            "customer_id": await next_code("CUS"),
            "sales_id": sales_id,
            "sales_name": await _sales_name(sales_id),
            "created_date": now,
            "updated_date": now,
        }
    )
    await db.customers.insert_one(dict(doc))
    await write_audit(user, "CREATE", "Customer", doc["customer_id"], None, payload.customer_name)
    return CustomerDetail(**doc)


@router.put("/{customer_id}", response_model=CustomerDetail)
async def update_customer(customer_id: str, payload: CustomerIn, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    existing = await db.customers.find_one({"customer_id": customer_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer tidak ditemukan")
    updates = payload.model_dump(exclude_unset=True)
    if user["role"] == SALES:
        updates.pop("sales_id", None)
    if updates.get("sales_id"):
        updates["sales_name"] = await _sales_name(updates["sales_id"])
    updates["updated_date"] = datetime.now(timezone.utc)
    await db.customers.update_one({"customer_id": customer_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Customer", customer_id, existing.get("customer_name"), updates.get("customer_name"))
    return CustomerDetail(**{**existing, **updates})


@router.delete("/{customer_id}")
async def archive_customer(customer_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    res = await db.customers.update_one(
        {"customer_id": customer_id, **scope}, {"$set": {"status": "Archived"}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer tidak ditemukan")
    await write_audit(user, "ARCHIVE", "Customer", customer_id, "Active", "Archived")
    return {"ok": True}
