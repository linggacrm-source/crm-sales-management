from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from lib.auth import SALES, SALES_MANAGER, SUPER_ADMIN, require_roles, visible_sales_ids, write_audit
from lib.db import db
from lib.ids import next_code

router = APIRouter(prefix="/targets", tags=["targets"])


class TargetIn(BaseModel):
    year: int = Field(ge=2000, le=2100)
    target_type: str
    owner_id: str
    target_value: float = Field(ge=0)
    notes: Optional[str] = None


class TargetRow(BaseModel):
    target_id: str
    year: int
    target_type: str
    owner_id: str
    owner_name: str
    manager_name: Optional[str] = None
    target_value: float
    notes: Optional[str] = None
    updated_date: Optional[datetime] = None


class TargetOptions(BaseModel):
    managers: list[dict]
    sales: list[dict]


async def _allowed_owner(user: dict, target_type: str, owner_id: str) -> dict:
    if target_type not in {"TEAM", "PERSONAL"}:
        raise HTTPException(status_code=400, detail="Jenis target tidak valid")
    owner = await db.users.find_one(
        {"user_id": owner_id, "status": "Active"},
        {"_id": 0, "user_id": 1, "name": 1, "role": 1, "manager_id": 1, "manager_name": 1},
    )
    if not owner:
        raise HTTPException(status_code=404, detail="Pemilik target tidak ditemukan")
    if target_type == "TEAM":
        if owner.get("role") != SALES_MANAGER:
            raise HTTPException(status_code=400, detail="Target tim harus dimiliki Sales Manager")
        if user["role"] == SALES_MANAGER and owner_id != user["user_id"]:
            raise HTTPException(status_code=403, detail="Manager hanya dapat mengatur target timnya sendiri")
    else:
        if owner.get("role") != SALES:
            raise HTTPException(status_code=400, detail="Target personal harus dimiliki Sales")
        ids = await visible_sales_ids(user)
        if ids is not None and owner_id not in ids:
            raise HTTPException(status_code=403, detail="Sales berada di luar scope Anda")
    return owner


@router.get("/options", response_model=TargetOptions)
async def target_options(user: dict = Depends(require_roles(SUPER_ADMIN, SALES_MANAGER))):
    ids = await visible_sales_ids(user)
    manager_query = {"role": SALES_MANAGER, "status": "Active"}
    sales_query = {"role": SALES, "status": "Active"}
    if ids is not None:
        manager_query["user_id"] = {"$in": ids}
        sales_query["user_id"] = {"$in": ids}
    managers = await db.users.find(manager_query, {"_id": 0, "user_id": 1, "name": 1}).sort([("name", 1)]).to_list(100)
    sales = await db.users.find(sales_query, {"_id": 0, "user_id": 1, "name": 1, "manager_id": 1, "manager_name": 1}).sort([("name", 1)]).to_list(500)
    return TargetOptions(managers=managers, sales=sales)


@router.get("", response_model=list[TargetRow])
async def list_targets(
    year: int = Query(..., ge=2000, le=2100),
    user: dict = Depends(require_roles(SUPER_ADMIN, SALES_MANAGER, SALES)),
):
    if user["role"] == SALES:
        query: dict = {"year": year, "target_type": "PERSONAL", "owner_id": user["user_id"]}
    else:
        ids = await visible_sales_ids(user)
        query = {"year": year}
        if ids is not None:
            query["owner_id"] = {"$in": ids}
    rows = await db.targets.find(query, {"_id": 0}).sort([("target_type", 1), ("owner_name", 1)]).to_list(1000)
    return [TargetRow(**r) for r in rows]


@router.post("", response_model=TargetRow)
async def upsert_target(
    payload: TargetIn,
    user: dict = Depends(require_roles(SUPER_ADMIN, SALES_MANAGER)),
):
    owner = await _allowed_owner(user, payload.target_type, payload.owner_id)
    now = datetime.now(timezone.utc)
    query = {"year": payload.year, "target_type": payload.target_type, "owner_id": payload.owner_id}
    existing = await db.targets.find_one(query, {"_id": 0})
    doc = {
        "target_id": existing.get("target_id") if existing else await next_code("TGT"),
        "year": payload.year,
        "target_type": payload.target_type,
        "owner_id": payload.owner_id,
        "owner_name": owner["name"],
        "manager_name": owner.get("manager_name") if payload.target_type == "PERSONAL" else owner["name"],
        "target_value": payload.target_value,
        "notes": payload.notes,
        "updated_date": now,
    }
    if existing:
        await db.targets.update_one({"target_id": existing["target_id"]}, {"$set": doc})
        action = "UPDATE"
        old_value = existing.get("target_value")
    else:
        doc["created_date"] = now
        await db.targets.insert_one(doc)
        action = "CREATE"
        old_value = None
    await write_audit(user, action, "Target", doc["target_id"], old_value, payload.target_value)
    return TargetRow(**doc)


@router.delete("/{target_id}")
async def delete_target(target_id: str, user: dict = Depends(require_roles(SUPER_ADMIN, SALES_MANAGER))):
    existing = await db.targets.find_one({"target_id": target_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Target tidak ditemukan")
    await _allowed_owner(user, existing["target_type"], existing["owner_id"])
    await db.targets.delete_one({"target_id": target_id})
    await write_audit(user, "DELETE", "Target", target_id, existing.get("target_value"), None)
    return {"ok": True}
