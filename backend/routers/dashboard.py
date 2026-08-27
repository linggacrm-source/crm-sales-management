from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from lib.auth import current_user, scope_filter, visible_sales_ids
from lib.dates import today_iso
from lib.db import db

router = APIRouter(tags=["dashboard"])

OPEN_STAGES = ["Lead", "Qualification", "Proposal", "Negotiation"]


class DashboardKPI(BaseModel):
    total_customers: int
    open_pipeline: float
    weighted_pipeline: float
    won_value: float
    total_quotations: int
    total_po: int
    po_value: float
    activities: int
    open_orders: int
    completed_orders: int
    overdue_orders: int


class StageBar(BaseModel):
    stage: str
    count: int
    value: float


class DashboardResponse(BaseModel):
    kpi: DashboardKPI
    pipeline_by_stage: list[StageBar]


class SalesKPIRow(BaseModel):
    sales_id: str
    sales_name: str
    role: str
    manager_name: Optional[str] = None
    open_pipeline: float = 0
    weighted_pipeline: float = 0
    won_value: float = 0
    quotations: int = 0
    po_count: int = 0
    po_value: float = 0
    activities: int = 0
    indent: int = 0
    overdue: int = 0


async def _sum(collection, match: dict, field: str) -> float:
    rows = await collection.aggregate(
        [{"$match": match}, {"$group": {"_id": None, "v": {"$sum": f"${field}"}}}]
    ).to_list(1)
    return round(rows[0]["v"], 2) if rows else 0.0


def _date_window(period: Optional[str]) -> dict:
    if not period or period == "all":
        return {}
    days = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}.get(period)
    if not days:
        return {}
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return {"created_date": {"$gte": since}}


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(
    period: Optional[str] = None,
    sales_id: Optional[str] = None,
    stage: Optional[str] = None,
    customer_id: Optional[str] = None,
    user: dict = Depends(current_user),
):
    """Pure aggregation: the response is numbers only, never transaction rows."""
    scope = await scope_filter(user)
    window = _date_window(period)
    base = {**scope, **window}
    if sales_id:
        base["sales_id"] = sales_id
    if customer_id:
        base["customer_id"] = customer_id

    opp_open = {**base, "stage": stage} if stage else {**base, "stage": {"$in": OPEN_STAGES}}
    kpi = DashboardKPI(
        total_customers=await db.customers.count_documents({**base, "status": "Active"}),
        open_pipeline=await _sum(db.opportunities, opp_open, "value"),
        weighted_pipeline=await _sum(db.opportunities, opp_open, "weighted_value"),
        won_value=await _sum(db.opportunities, {**base, "stage": "Won"}, "value"),
        total_quotations=await db.quotations.count_documents(base),
        total_po=await db.purchase_orders.count_documents(base),
        po_value=await _sum(db.purchase_orders, base, "po_value"),
        activities=await db.activities.count_documents(base),
        open_orders=await db.order_monitoring.count_documents(
            {**base, "status": {"$nin": ["Completed", "Cancelled"]}}
        ),
        completed_orders=await db.order_monitoring.count_documents({**base, "status": "Completed"}),
        overdue_orders=await db.order_monitoring.count_documents(
            {**base, "status": {"$nin": ["Completed", "Cancelled"]}, "eta": {"$lt": today_iso(), "$ne": None}}
        ),
    )
    agg = await db.opportunities.aggregate(
        [{"$match": base}, {"$group": {"_id": "$stage", "count": {"$sum": 1}, "value": {"$sum": "$value"}}}]
    ).to_list(20)
    by_stage = {r["_id"]: r for r in agg}
    bars = [
        StageBar(
            stage=s,
            count=by_stage.get(s, {}).get("count", 0),
            value=round(by_stage.get(s, {}).get("value", 0), 2),
        )
        for s in OPEN_STAGES + ["Won", "Lost"]
    ]
    return DashboardResponse(kpi=kpi, pipeline_by_stage=bars)


@router.get("/sales-team", response_model=list[SalesKPIRow])
async def sales_team(user: dict = Depends(current_user)):
    """Per-sales KPI via grouped aggregations — 6 queries total, not N per sales."""
    ids = await visible_sales_ids(user)
    uq: dict = {"role": {"$in": ["SALES", "SALES_MANAGER"]}, "status": "Active"}
    if ids is not None:
        uq["user_id"] = {"$in": ids}
    people = await db.users.find(
        uq, {"_id": 0, "user_id": 1, "name": 1, "role": 1, "manager_name": 1}
    ).sort([("name", 1)]).to_list(200)
    sales_ids = [p["user_id"] for p in people]
    if not sales_ids:
        return []
    match = {"sales_id": {"$in": sales_ids}}

    async def group(collection, extra: dict, sum_field: Optional[str] = None) -> dict:
        stage: dict = {"_id": "$sales_id", "count": {"$sum": 1}}
        if sum_field:
            stage["value"] = {"$sum": f"${sum_field}"}
        rows = await collection.aggregate([{"$match": {**match, **extra}}, {"$group": stage}]).to_list(500)
        return {r["_id"]: r for r in rows}

    open_pipe = await group(db.opportunities, {"stage": {"$in": OPEN_STAGES}}, "value")
    weighted = await group(db.opportunities, {"stage": {"$in": OPEN_STAGES}}, "weighted_value")
    won = await group(db.opportunities, {"stage": "Won"}, "value")
    qt = await group(db.quotations, {})
    po = await group(db.purchase_orders, {}, "po_value")
    acts = await group(db.activities, {})
    indent = await group(db.order_monitoring, {"status": "Indent"})
    overdue = await group(
        db.order_monitoring,
        {"status": {"$nin": ["Completed", "Cancelled"]}, "eta": {"$lt": today_iso(), "$ne": None}},
    )

    out: list[SalesKPIRow] = []
    for p in people:
        uid = p["user_id"]
        out.append(
            SalesKPIRow(
                sales_id=uid,
                sales_name=p["name"],
                role=p["role"],
                manager_name=p.get("manager_name"),
                open_pipeline=round(open_pipe.get(uid, {}).get("value", 0), 2),
                weighted_pipeline=round(weighted.get(uid, {}).get("value", 0), 2),
                won_value=round(won.get(uid, {}).get("value", 0), 2),
                quotations=qt.get(uid, {}).get("count", 0),
                po_count=po.get(uid, {}).get("count", 0),
                po_value=round(po.get(uid, {}).get("value", 0), 2),
                activities=acts.get(uid, {}).get("count", 0),
                indent=indent.get(uid, {}).get("count", 0),
                overdue=overdue.get(uid, {}).get("count", 0),
            )
        )
    return out
