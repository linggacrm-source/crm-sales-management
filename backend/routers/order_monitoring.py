from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import current_user, scope_filter, write_audit
from lib.dates import today_iso
from lib.db import db
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/order-monitoring", tags=["order-monitoring"])

STATUSES = ["Waiting Order", "Processing", "Indent", "Ready Stock", "Delivery", "Completed", "Cancelled"]

LIST_PROJECTION = {
    "_id": 0,
    "monitoring_id": 1,
    "po_id": 1,
    "po_number": 1,
    "customer_name": 1,
    "product_name": 1,
    "qty": 1,
    "status": 1,
    "supplier": 1,
    "eta": 1,
    "sales_name": 1,
    "actual_delivery_date": 1,
    "last_update": 1,
}
SORTABLE = ["eta", "po_number", "status", "last_update", "created_date"]


class MonitoringUpdate(BaseModel):
    status: Optional[str] = None
    supplier: Optional[str] = None
    distributor: Optional[str] = None
    eta: Optional[str] = None
    actual_delivery_date: Optional[str] = None
    notes: Optional[str] = None


class MonitoringRow(BaseModel):
    monitoring_id: str
    po_id: Optional[str] = None
    po_number: Optional[str] = None
    customer_name: Optional[str] = None
    product_name: Optional[str] = None
    qty: float = 0
    status: str
    supplier: Optional[str] = None
    eta: Optional[str] = None
    sales_name: Optional[str] = None
    actual_delivery_date: Optional[str] = None
    eta_flag: str = "ON_TIME"


class MonitoringListResponse(BaseModel):
    data: list[MonitoringRow]
    total: int
    page: int
    page_size: int


class MonitoringSummary(BaseModel):
    total: int
    indent: int
    ready_stock: int
    delivery: int
    completed: int
    overdue: int


def _eta_flag(row: dict, today: str, soon: str) -> str:
    if row.get("status") in ("Completed", "Cancelled"):
        return "COMPLETED"
    eta = row.get("eta")
    if not eta:
        return "ON_TIME"
    if eta < today:
        return "OVERDUE"
    if eta <= soon:
        return "DUE_SOON"
    return "ON_TIME"


def _soon_date() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()


@router.get("/summary", response_model=MonitoringSummary)
async def monitoring_summary(user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    today = today_iso()
    return MonitoringSummary(
        total=await db.order_monitoring.count_documents(scope),
        indent=await db.order_monitoring.count_documents({**scope, "status": "Indent"}),
        ready_stock=await db.order_monitoring.count_documents({**scope, "status": "Ready Stock"}),
        delivery=await db.order_monitoring.count_documents({**scope, "status": "Delivery"}),
        completed=await db.order_monitoring.count_documents({**scope, "status": "Completed"}),
        overdue=await db.order_monitoring.count_documents(
            {**scope, "status": {"$nin": ["Completed", "Cancelled"]}, "eta": {"$lt": today, "$ne": None}}
        ),
    )


@router.get("", response_model=MonitoringListResponse)
async def list_monitoring(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    sales_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    supplier: Optional[str] = None,
    eta_flag: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user: dict = Depends(current_user),
):
    """One indexed query straight to the table shape — no client-side joins."""
    query = await scope_filter(user)
    query.update(search_clause(search, ["po_number", "customer_name", "product_name", "monitoring_id"]))
    if status:
        query["status"] = status
    if sales_id:
        query["sales_id"] = sales_id
    if customer_id:
        query["customer_id"] = customer_id
    if supplier:
        query["supplier"] = supplier
    today = today_iso()
    soon = _soon_date()
    if eta_flag == "OVERDUE":
        query["status"] = {"$nin": ["Completed", "Cancelled"]}
        query["eta"] = {"$lt": today, "$ne": None}
    elif eta_flag == "DUE_SOON":
        query["status"] = {"$nin": ["Completed", "Cancelled"]}
        query["eta"] = {"$gte": today, "$lte": soon}
    elif eta_flag == "COMPLETED":
        query["status"] = "Completed"
    result = await paginate(
        db.order_monitoring, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "eta"),
    )
    rows = [MonitoringRow(**r, eta_flag=_eta_flag(r, today, soon)) for r in result["data"]]
    return MonitoringListResponse(
        data=rows, total=result["total"], page=result["page"], page_size=result["page_size"]
    )


@router.patch("/{monitoring_id}", response_model=MonitoringRow)
async def update_monitoring(monitoring_id: str, payload: MonitoringUpdate, user: dict = Depends(current_user)):
    if payload.status and payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Status tidak valid")
    scope = await scope_filter(user)
    existing = await db.order_monitoring.find_one({"monitoring_id": monitoring_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Data monitoring tidak ditemukan")
    now = datetime.now(timezone.utc)
    updates = payload.model_dump(exclude_unset=True)
    updates["last_update"] = now
    updates["updated_date"] = now
    if updates.get("status") == "Completed" and not updates.get("actual_delivery_date"):
        updates["actual_delivery_date"] = today_iso()
    await db.order_monitoring.update_one({"monitoring_id": monitoring_id}, {"$set": updates})
    if updates.get("status"):
        await write_audit(user, "UPDATE", "Order Monitoring", monitoring_id,
                          f"Status: {existing.get('status')}", f"Status: {updates['status']}")
        if updates["status"] == "Completed":
            remaining = await db.order_monitoring.count_documents(
                {"po_id": existing.get("po_id"), "status": {"$nin": ["Completed", "Cancelled"]}}
            )
            if remaining == 0 and existing.get("po_id"):
                await db.purchase_orders.update_one(
                    {"po_id": existing["po_id"]}, {"$set": {"status": "Completed", "updated_date": now}}
                )
    merged = {**existing, **updates}
    return MonitoringRow(**{k: v for k, v in merged.items() if k in MonitoringRow.model_fields},
                         eta_flag=_eta_flag(merged, today_iso(), _soon_date()))
