from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import (
    SALES_MANAGER,
    SUPER_ADMIN,
    current_user,
    hash_password,
    require_roles,
    visible_sales_ids,
    write_audit,
)
from lib.db import db
from lib.ids import next_code
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/users", tags=["users"])

LIST_PROJECTION = {
    "_id": 0,
    "user_id": 1,
    "name": 1,
    "email": 1,
    "role": 1,
    "manager_id": 1,
    "manager_name": 1,
    "phone": 1,
    "status": 1,
    "last_login": 1,
}
SORTABLE = ["name", "email", "role", "status", "created_date", "last_login"]


class UserCreate(BaseModel):
    name: str
    email: str
    password: str = "Password123"
    role: str
    manager_id: Optional[str] = None
    phone: Optional[str] = None
    status: str = "Active"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    manager_id: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None


class UserRow(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    phone: Optional[str] = None
    status: str
    last_login: Optional[datetime] = None


class UserListResponse(BaseModel):
    data: list[UserRow]
    total: int
    page: int
    page_size: int


class SalesOption(BaseModel):
    user_id: str
    name: str
    role: str


async def _manager_name(manager_id: Optional[str]) -> Optional[str]:
    if not manager_id:
        return None
    mgr = await db.users.find_one({"user_id": manager_id}, {"_id": 0, "name": 1})
    return mgr["name"] if mgr else None


@router.get("/options", response_model=list[SalesOption])
async def user_options(user: dict = Depends(current_user)):
    """Small cacheable master list for filter dropdowns — scoped to what the user may see."""
    ids = await visible_sales_ids(user)
    query: dict = {"status": "Active"}
    if ids is not None:
        query["user_id"] = {"$in": ids}
    rows = await db.users.find(query, {"_id": 0, "user_id": 1, "name": 1, "role": 1}).sort(
        [("name", 1)]
    ).to_list(500)
    return [SalesOption(**r) for r in rows]


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    manager_id: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user: dict = Depends(require_roles(SUPER_ADMIN, SALES_MANAGER)),
):
    query: dict = {}
    query.update(search_clause(search, ["name", "email", "user_id"]))
    if role:
        query["role"] = role
    if status:
        query["status"] = status
    if manager_id:
        query["manager_id"] = manager_id
    if user["role"] == SALES_MANAGER:
        ids = await visible_sales_ids(user)
        query["user_id"] = {"$in": ids or []}
    result = await paginate(
        db.users, query, page, page_size, LIST_PROJECTION, sort_spec(sort_by, sort_dir, SORTABLE, "created_date")
    )
    return UserListResponse(**result)


@router.post("", response_model=UserRow)
async def create_user(payload: UserCreate, user: dict = Depends(require_roles(SUPER_ADMIN))):
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Email sudah digunakan")
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": await next_code("USR"),
        "name": payload.name,
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "manager_id": payload.manager_id,
        "manager_name": await _manager_name(payload.manager_id),
        "phone": payload.phone,
        "status": payload.status,
        "must_change_password": True,
        "last_login": None,
        "created_date": now,
        "updated_date": now,
    }
    await db.users.insert_one(dict(doc))
    await write_audit(user, "CREATE", "User", doc["user_id"], None, payload.name)
    doc.pop("password_hash", None)
    return UserRow(**doc)


@router.put("/{user_id}", response_model=UserRow)
async def update_user(user_id: str, payload: UserUpdate, user: dict = Depends(require_roles(SUPER_ADMIN))):
    existing = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "email" in updates:
        updates["email"] = updates["email"].strip().lower()
    if "manager_id" in updates:
        updates["manager_name"] = await _manager_name(updates["manager_id"])
    updates["updated_date"] = datetime.now(timezone.utc)
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "User", user_id, existing.get("status"), updates.get("status", existing.get("status")))
    merged = {**existing, **updates}
    return UserRow(**merged)


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str, user: dict = Depends(require_roles(SUPER_ADMIN))):
    res = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": hash_password("Password123"), "must_change_password": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    await write_audit(user, "RESET_PASSWORD", "User", user_id)
    return {"ok": True, "temporary_password": "Password123"}
