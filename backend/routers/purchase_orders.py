from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import SALES, current_user, scope_filter, write_audit
from lib.dates import today_iso
from lib.db import db
from lib.ids import next_code
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])

STATUSES = ["Draft", "Received", "Confirmed", "Processing", "Completed", "Cancelled"]

LIST_PROJECTION = {
    "_id": 0,
    "po_id": 1,
    "po_number": 1,
    "po_date": 1,
    "customer_id": 1,
    "customer_name": 1,
    "quotation_number": 1,
    "sales_id": 1,
    "sales_name": 1,
    "po_value": 1,
    "status": 1,
}
SORTABLE = ["po_number", "po_date", "po_value", "status", "created_date"]


class POItemIn(BaseModel):
    product_id: Optional[str] = None
    description: str
    qty: float = 1
    unit: str = "Unit"
    unit_price: float = 0


class POItem(POItemIn):
    po_item_id: str
    subtotal: float = 0


class POIn(BaseModel):
    """A purchase order RECEIVED FROM the customer — po_number is the customer's own number."""

    po_number: str
    customer_id: str
    quotation_id: Optional[str] = None
    sales_id: Optional[str] = None
    po_date: Optional[str] = None
    delivery_address: Optional[str] = None
    payment_term: Optional[str] = None
    notes: Optional[str] = None
    status: str = "Received"
    document_name: Optional[str] = None
    items: list[POItemIn] = []


class StatusChange(BaseModel):
    status: str


class PORow(BaseModel):
    po_id: str
    po_number: str
    po_date: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    quotation_number: Optional[str] = None
    sales_id: Optional[str] = None
    sales_name: Optional[str] = None
    po_value: float = 0
    status: str


class PODetail(PORow):
    quotation_id: Optional[str] = None
    delivery_address: Optional[str] = None
    payment_term: Optional[str] = None
    notes: Optional[str] = None
    document_name: Optional[str] = None
    items: list[POItem] = []


class POListResponse(BaseModel):
    data: list[PORow]
    total: int
    page: int
    page_size: int


class MonitoringCreated(BaseModel):
    created: int
    monitoring_ids: list[str]


def _build_items(items: list[POItemIn]) -> tuple[list[dict], float]:
    built: list[dict] = []
    total = 0.0
    for i, it in enumerate(items, start=1):
        line = round(it.qty * it.unit_price, 2)
        total += line
        built.append({**it.model_dump(), "po_item_id": f"POI-{i:03d}", "subtotal": line})
    return built, round(total, 2)


@router.get("", response_model=POListResponse)
async def list_pos(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    sales_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user: dict = Depends(current_user),
):
    query = await scope_filter(user)
    query.update(search_clause(search, ["po_number", "customer_name", "quotation_number", "po_id"]))
    if status:
        query["status"] = status
    if sales_id:
        query["sales_id"] = sales_id
    if customer_id:
        query["customer_id"] = customer_id
    result = await paginate(
        db.purchase_orders, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "created_date"),
    )
    return POListResponse(**result)


@router.get("/{po_id}", response_model=PODetail)
async def get_po(po_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.purchase_orders.find_one({"po_id": po_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase Order tidak ditemukan")
    return PODetail(**doc)


async def _assert_po_number_free(customer_id: str, po_number: str, exclude_po_id: str | None = None) -> None:
    """The customer's PO number must be unique within that customer."""
    query: dict = {"customer_id": customer_id, "po_number": po_number}
    if exclude_po_id:
        query["po_id"] = {"$ne": exclude_po_id}
    if await db.purchase_orders.find_one(query, {"_id": 1}):
        raise HTTPException(
            status_code=400, detail=f"Nomor PO '{po_number}' sudah terdaftar untuk customer ini"
        )


@router.post("", response_model=PODetail)
async def create_po(payload: POIn, user: dict = Depends(current_user)):
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1})
    if not cust:
        raise HTTPException(status_code=400, detail="Customer tidak ditemukan")
    po_number = payload.po_number.strip()
    if not po_number:
        raise HTTPException(status_code=400, detail="Nomor PO customer wajib diisi")
    await _assert_po_number_free(payload.customer_id, po_number)
    sales_id = user["user_id"] if user["role"] == SALES else (payload.sales_id or user["user_id"])
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1})
    quotation_number = None
    if payload.quotation_id:
        qt = await db.quotations.find_one({"quotation_id": payload.quotation_id}, {"_id": 0, "quotation_number": 1})
        quotation_number = qt["quotation_number"] if qt else None
    items, total = _build_items(payload.items)
    now = datetime.now(timezone.utc)
    doc = payload.model_dump()
    doc.update(
        {
            "po_id": await next_code("POR"),
            "po_number": po_number,
            "po_date": payload.po_date or today_iso(),
            "customer_name": cust["customer_name"],
            "quotation_number": quotation_number,
            "sales_id": sales_id,
            "sales_name": sales["name"] if sales else None,
            "items": items,
            "po_value": total,
            "created_date": now,
            "updated_date": now,
        }
    )
    await db.purchase_orders.insert_one(dict(doc))
    await write_audit(user, "CREATE", "PO", doc["po_number"], None, total)
    return PODetail(**doc)


@router.put("/{po_id}", response_model=PODetail)
async def update_po(po_id: str, payload: POIn, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    existing = await db.purchase_orders.find_one({"po_id": po_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Purchase Order tidak ditemukan")
    po_number = payload.po_number.strip()
    if not po_number:
        raise HTTPException(status_code=400, detail="Nomor PO customer wajib diisi")
    await _assert_po_number_free(payload.customer_id, po_number, exclude_po_id=po_id)
    items, total = _build_items(payload.items)
    updates = payload.model_dump()
    updates.update(
        {"po_number": po_number, "items": items, "po_value": total, "updated_date": datetime.now(timezone.utc)}
    )
    if user["role"] == SALES:
        updates.pop("sales_id", None)
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1})
    updates["customer_name"] = cust["customer_name"] if cust else existing.get("customer_name")
    if payload.quotation_id:
        qt = await db.quotations.find_one({"quotation_id": payload.quotation_id}, {"_id": 0, "quotation_number": 1})
        updates["quotation_number"] = qt["quotation_number"] if qt else None
    await db.purchase_orders.update_one({"po_id": po_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "PO", existing.get("po_number", po_id), existing.get("po_value"), total)
    return PODetail(**{**existing, **updates})


@router.patch("/{po_id}/status", response_model=PODetail)
async def change_po_status(po_id: str, payload: StatusChange, user: dict = Depends(current_user)):
    if payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Status tidak valid")
    scope = await scope_filter(user)
    existing = await db.purchase_orders.find_one({"po_id": po_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Purchase Order tidak ditemukan")
    updates = {"status": payload.status, "updated_date": datetime.now(timezone.utc)}
    await db.purchase_orders.update_one({"po_id": po_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "PO", existing.get("po_number", po_id),
                      f"Status: {existing.get('status')}", f"Status: {payload.status}")
    return PODetail(**{**existing, **updates})


@router.post("/{po_id}/create-monitoring", response_model=MonitoringCreated)
async def create_monitoring(po_id: str, user: dict = Depends(current_user)):
    """One monitoring row per PO item, reusing the PO's customer_id / sales_id / product_id."""
    scope = await scope_filter(user)
    po = await db.purchase_orders.find_one({"po_id": po_id, **scope}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order tidak ditemukan")
    existing = await db.order_monitoring.count_documents({"po_id": po_id})
    if existing:
        raise HTTPException(status_code=400, detail="Order monitoring untuk PO ini sudah dibuat")
    if not po.get("items"):
        raise HTTPException(status_code=400, detail="PO tidak memiliki item")
    now = datetime.now(timezone.utc)
    docs = []
    ids = []
    for it in po["items"]:
        product_name = it.get("description")
        supplier = None
        distributor = None
        if it.get("product_id"):
            prod = await db.products.find_one(
                {"product_id": it["product_id"]},
                {"_id": 0, "product_name": 1, "supplier": 1, "distributor": 1},
            )
            if prod:
                product_name = prod.get("product_name") or product_name
                supplier = prod.get("supplier")
                distributor = prod.get("distributor")
        mid = await next_code("MON")
        ids.append(mid)
        docs.append(
            {
                "monitoring_id": mid,
                "po_id": po["po_id"],
                "po_number": po["po_number"],
                "customer_id": po["customer_id"],
                "customer_name": po.get("customer_name"),
                "sales_id": po.get("sales_id"),
                "sales_name": po.get("sales_name"),
                "product_id": it.get("product_id"),
                "product_name": product_name,
                "qty": it.get("qty", 0),
                "status": "Waiting Order",
                "supplier": supplier,
                "distributor": distributor,
                "eta": None,
                "actual_delivery_date": None,
                "notes": None,
                "last_update": now,
                "created_date": now,
                "updated_date": now,
            }
        )
    await db.order_monitoring.insert_many(docs)
    await db.purchase_orders.update_one({"po_id": po_id}, {"$set": {"status": "Processing", "updated_date": now}})
    await write_audit(user, "CREATE", "Order Monitoring", po["po_number"], None, f"{len(docs)} item")
    return MonitoringCreated(created=len(docs), monitoring_ids=ids)


@router.delete("/{po_id}")
async def delete_po(po_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    res = await db.purchase_orders.delete_one({"po_id": po_id, **scope})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Purchase Order tidak ditemukan")
    await write_audit(user, "DELETE", "PO", po_id)
    return {"ok": True}
