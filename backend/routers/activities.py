from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import SALES, current_user, scope_filter, write_audit
from lib.dates import today_iso
from lib.db import db
from lib.ids import next_code
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/activities", tags=["activities"])

LIST_PROJECTION = {
    "_id": 0,
    "activity_id": 1,
    "sales_id": 1,
    "sales_name": 1,
    "customer_id": 1,
    "customer_name": 1,
    "opportunity_id": 1,
    "activity_type": 1,
    "activity_date": 1,
    "subject": 1,
    "next_followup": 1,
    "status": 1,
}
SORTABLE = ["activity_date", "next_followup", "status", "activity_type", "created_date"]


class ActivityIn(BaseModel):
    customer_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    sales_id: Optional[str] = None
    activity_type: str = "Call"
    activity_date: str
    subject: str
    description: Optional[str] = None
    next_followup: Optional[str] = None
    status: str = "Open"


class ActivityRow(BaseModel):
    activity_id: str
    sales_id: Optional[str] = None
    sales_name: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    opportunity_id: Optional[str] = None
    activity_type: str
    activity_date: Optional[str] = None
    subject: str
    description: Optional[str] = None
    next_followup: Optional[str] = None
    status: str


class ActivityListResponse(BaseModel):
    data: list[ActivityRow]
    total: int
    page: int
    page_size: int


class ActivitySummary(BaseModel):
    today: int
    upcoming: int
    overdue: int
    completed: int


@router.get("/summary", response_model=ActivitySummary)
async def activity_summary(user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    today = today_iso()
    return ActivitySummary(
        today=await db.activities.count_documents({**scope, "activity_date": today}),
        upcoming=await db.activities.count_documents(
            {**scope, "status": "Open", "next_followup": {"$gt": today}}
        ),
        overdue=await db.activities.count_documents(
            {**scope, "status": "Open", "next_followup": {"$lt": today, "$ne": None}}
        ),
        completed=await db.activities.count_documents({**scope, "status": "Completed"}),
    )


@router.get("", response_model=ActivityListResponse)
async def list_activities(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    activity_type: Optional[str] = None,
    status: Optional[str] = None,
    sales_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    bucket: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user: dict = Depends(current_user),
):
    query = await scope_filter(user)
    query.update(search_clause(search, ["subject", "customer_name", "description", "activity_id"]))
    if activity_type:
        query["activity_type"] = activity_type
    if status:
        query["status"] = status
    if sales_id:
        query["sales_id"] = sales_id
    if customer_id:
        query["customer_id"] = customer_id
    today = today_iso()
    if bucket == "today":
        query["activity_date"] = today
    elif bucket == "upcoming":
        query["status"] = "Open"
        query["next_followup"] = {"$gt": today}
    elif bucket == "overdue":
        query["status"] = "Open"
        query["next_followup"] = {"$lt": today, "$ne": None}
    elif bucket == "completed":
        query["status"] = "Completed"
    result = await paginate(
        db.activities, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "activity_date"),
    )
    return ActivityListResponse(**result)


@router.post("", response_model=ActivityRow)
async def create_activity(payload: ActivityIn, user: dict = Depends(current_user)):
    sales_id = user["user_id"] if user["role"] == SALES else (payload.sales_id or user["user_id"])
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1})
    customer_name = None
    if payload.customer_id:
        cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1})
        customer_name = cust["customer_name"] if cust else None
    now = datetime.now(timezone.utc)
    doc = payload.model_dump()
    doc.update(
        {
            "activity_id": await next_code("ACT"),
            "sales_id": sales_id,
            "sales_name": sales["name"] if sales else None,
            "customer_name": customer_name,
            "created_date": now,
            "updated_date": now,
        }
    )
    await db.activities.insert_one(dict(doc))
    await write_audit(user, "CREATE", "Activity", doc["activity_id"], None, payload.subject)
    return ActivityRow(**doc)


@router.put("/{activity_id}", response_model=ActivityRow)
async def update_activity(activity_id: str, payload: ActivityIn, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    existing = await db.activities.find_one({"activity_id": activity_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Aktivitas tidak ditemukan")
    updates = payload.model_dump(exclude_unset=True)
    if user["role"] == SALES:
        updates.pop("sales_id", None)
    if updates.get("customer_id"):
        cust = await db.customers.find_one({"customer_id": updates["customer_id"]}, {"_id": 0, "customer_name": 1})
        updates["customer_name"] = cust["customer_name"] if cust else None
    updates["updated_date"] = datetime.now(timezone.utc)
    await db.activities.update_one({"activity_id": activity_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Activity", activity_id, existing.get("status"), updates.get("status"))
    return ActivityRow(**{**existing, **updates})


@router.delete("/{activity_id}")
async def delete_activity(activity_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    res = await db.activities.delete_one({"activity_id": activity_id, **scope})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Aktivitas tidak ditemukan")
    await write_audit(user, "DELETE", "Activity", activity_id)
    return {"ok": True}
