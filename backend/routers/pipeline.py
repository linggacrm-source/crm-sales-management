import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import SALES, current_user, scope_filter, write_audit
from lib.db import db
from lib.ids import next_code
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

STAGES = ["Lead", "Qualification", "Proposal", "Negotiation", "Won", "Lost"]
OPEN_STAGES = ["Lead", "Qualification", "Proposal", "Negotiation"]

LIST_PROJECTION = {
    "_id": 0,
    "opportunity_id": 1,
    "opportunity_name": 1,
    "customer_id": 1,
    "customer_name": 1,
    "sales_id": 1,
    "sales_name": 1,
    "value": 1,
    "probability": 1,
    "weighted_value": 1,
    "stage": 1,
    "expected_close_date": 1,
    "source": 1,
}
SORTABLE = ["opportunity_name", "value", "weighted_value", "stage", "expected_close_date", "created_date"]


class OpportunityIn(BaseModel):
    opportunity_name: str
    customer_id: str
    sales_id: Optional[str] = None
    value: float = 0
    probability: float = 10
    stage: str = "Lead"
    expected_close_date: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class StageChange(BaseModel):
    stage: str


class OpportunityRow(BaseModel):
    opportunity_id: str
    opportunity_name: str
    customer_id: str
    customer_name: Optional[str] = None
    sales_id: Optional[str] = None
    sales_name: Optional[str] = None
    value: float = 0
    probability: float = 0
    weighted_value: float = 0
    stage: str
    expected_close_date: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class OpportunityListResponse(BaseModel):
    data: list[OpportunityRow]
    total: int
    page: int
    page_size: int


class StageSummary(BaseModel):
    stage: str
    count: int
    value: float
    weighted_value: float


class KanbanColumn(BaseModel):
    stage: str
    count: int
    value: float
    items: list[OpportunityRow]


async def _names(customer_id: str, sales_id: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    cust = await db.customers.find_one({"customer_id": customer_id}, {"_id": 0, "customer_name": 1})
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1}) if sales_id else None
    return (cust["customer_name"] if cust else None), (sales["name"] if sales else None)


async def _build_query(user: dict, search, stage, sales_id, customer_id) -> dict:
    query = await scope_filter(user)
    query.update(search_clause(search, ["opportunity_name", "customer_name", "opportunity_id"]))
    if stage:
        query["stage"] = stage
    if sales_id:
        query["sales_id"] = sales_id
    if customer_id:
        query["customer_id"] = customer_id
    return query


@router.get("", response_model=OpportunityListResponse)
async def list_pipeline(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    stage: Optional[str] = None,
    sales_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user: dict = Depends(current_user),
):
    query = await _build_query(user, search, stage, sales_id, customer_id)
    result = await paginate(
        db.opportunities, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "created_date"),
    )
    return OpportunityListResponse(**result)


@router.get("/summary", response_model=list[StageSummary])
async def pipeline_summary(
    search: Optional[str] = None,
    sales_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    user: dict = Depends(current_user),
):
    """Aggregation only — the frontend never sums rows itself."""
    query = await _build_query(user, search, None, sales_id, customer_id)
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$stage", "count": {"$sum": 1}, "value": {"$sum": "$value"},
                    "weighted_value": {"$sum": "$weighted_value"}}},
    ]
    rows = await db.opportunities.aggregate(pipeline).to_list(20)
    by_stage = {r["_id"]: r for r in rows}
    return [
        StageSummary(
            stage=s,
            count=by_stage.get(s, {}).get("count", 0),
            value=by_stage.get(s, {}).get("value", 0),
            weighted_value=by_stage.get(s, {}).get("weighted_value", 0),
        )
        for s in STAGES
    ]


@router.get("/kanban", response_model=list[KanbanColumn])
async def pipeline_kanban(
    search: Optional[str] = None,
    sales_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    limit_per_stage: int = 15,
    user: dict = Depends(current_user),
):
    """Bounded per-stage fetch — never the whole board. All stages queried concurrently."""
    base = await _build_query(user, search, None, sales_id, customer_id)
    per_stage = min(limit_per_stage, 50)

    async def column(stage: str) -> KanbanColumn:
        query = {**base, "stage": stage}
        count, agg, items = await asyncio.gather(
            db.opportunities.count_documents(query),
            db.opportunities.aggregate(
                [{"$match": query}, {"$group": {"_id": None, "value": {"$sum": "$value"}}}]
            ).to_list(1),
            db.opportunities.find(query, LIST_PROJECTION).sort([("value", -1)]).limit(per_stage).to_list(per_stage),
        )
        return KanbanColumn(
            stage=stage,
            count=count,
            value=agg[0]["value"] if agg else 0,
            items=[OpportunityRow(**i) for i in items],
        )

    return list(await asyncio.gather(*(column(s) for s in STAGES)))


@router.get("/{opportunity_id}", response_model=OpportunityRow)
async def get_opportunity(opportunity_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.opportunities.find_one({"opportunity_id": opportunity_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Opportunity tidak ditemukan")
    return OpportunityRow(**doc)


@router.post("", response_model=OpportunityRow)
async def create_opportunity(payload: OpportunityIn, user: dict = Depends(current_user)):
    if payload.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Stage tidak valid")
    sales_id = user["user_id"] if user["role"] == SALES else (payload.sales_id or user["user_id"])
    customer_name, sales_name = await _names(payload.customer_id, sales_id)
    if customer_name is None:
        raise HTTPException(status_code=400, detail="Customer tidak ditemukan")
    now = datetime.now(timezone.utc)
    doc = payload.model_dump()
    doc.update(
        {
            "opportunity_id": await next_code("OPP"),
            "sales_id": sales_id,
            "sales_name": sales_name,
            "customer_name": customer_name,
            "weighted_value": round(payload.value * payload.probability / 100, 2),
            "created_date": now,
            "updated_date": now,
        }
    )
    await db.opportunities.insert_one(dict(doc))
    await write_audit(user, "CREATE", "Opportunity", doc["opportunity_id"], None, payload.opportunity_name)
    return OpportunityRow(**doc)


@router.put("/{opportunity_id}", response_model=OpportunityRow)
async def update_opportunity(opportunity_id: str, payload: OpportunityIn, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    existing = await db.opportunities.find_one({"opportunity_id": opportunity_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Opportunity tidak ditemukan")
    updates = payload.model_dump(exclude_unset=True)
    if user["role"] == SALES:
        updates.pop("sales_id", None)
    value = updates.get("value", existing.get("value", 0))
    prob = updates.get("probability", existing.get("probability", 0))
    updates["weighted_value"] = round(value * prob / 100, 2)
    if updates.get("customer_id"):
        cname, _sname = await _names(updates["customer_id"], None)
        updates["customer_name"] = cname
    if updates.get("sales_id"):
        sales = await db.users.find_one({"user_id": updates["sales_id"]}, {"_id": 0, "name": 1})
        updates["sales_name"] = sales["name"] if sales else None
    updates["updated_date"] = datetime.now(timezone.utc)
    await db.opportunities.update_one({"opportunity_id": opportunity_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Opportunity", opportunity_id, existing.get("stage"), updates.get("stage"))
    return OpportunityRow(**{**existing, **updates})


@router.patch("/{opportunity_id}/stage", response_model=OpportunityRow)
async def change_stage(opportunity_id: str, payload: StageChange, user: dict = Depends(current_user)):
    if payload.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Stage tidak valid")
    scope = await scope_filter(user)
    existing = await db.opportunities.find_one({"opportunity_id": opportunity_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Opportunity tidak ditemukan")
    prob_map = {"Lead": 10, "Qualification": 25, "Proposal": 50, "Negotiation": 75, "Won": 100, "Lost": 0}
    prob = prob_map[payload.stage]
    updates = {
        "stage": payload.stage,
        "probability": prob,
        "weighted_value": round(existing.get("value", 0) * prob / 100, 2),
        "updated_date": datetime.now(timezone.utc),
    }
    await db.opportunities.update_one({"opportunity_id": opportunity_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Opportunity", opportunity_id,
                      f"Stage: {existing.get('stage')}", f"Stage: {payload.stage}")
    return OpportunityRow(**{**existing, **updates})


@router.delete("/{opportunity_id}")
async def delete_opportunity(opportunity_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    res = await db.opportunities.delete_one({"opportunity_id": opportunity_id, **scope})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Opportunity tidak ditemukan")
    await write_audit(user, "DELETE", "Opportunity", opportunity_id)
    return {"ok": True}
