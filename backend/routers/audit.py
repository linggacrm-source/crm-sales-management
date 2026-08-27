from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from lib.auth import SALES_MANAGER, SUPER_ADMIN, require_roles
from lib.db import db
from lib.query import paginate, search_clause

router = APIRouter(prefix="/audit-log", tags=["audit"])

PROJECTION = {
    "_id": 0,
    "user_id": 1,
    "user_name": 1,
    "action": 1,
    "module": 1,
    "record_id": 1,
    "old_value": 1,
    "new_value": 1,
    "timestamp": 1,
}


class AuditRow(BaseModel):
    user_id: str
    user_name: Optional[str] = None
    action: str
    module: str
    record_id: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: Optional[datetime] = None


class AuditListResponse(BaseModel):
    data: list[AuditRow]
    total: int
    page: int
    page_size: int


@router.get("", response_model=AuditListResponse)
async def list_audit(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    module: Optional[str] = None,
    action: Optional[str] = None,
    _: dict = Depends(require_roles(SUPER_ADMIN, SALES_MANAGER)),
):
    query: dict = {}
    query.update(search_clause(search, ["user_name", "record_id", "module", "action"]))
    if module:
        query["module"] = module
    if action:
        query["action"] = action
    result = await paginate(db.audit_logs, query, page, page_size, PROJECTION, [("timestamp", -1)])
    return AuditListResponse(**result)
