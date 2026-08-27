"""Auth: password hashing, JWT httpOnly cookie sessions, RBAC + data-scope helpers."""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from passlib.context import CryptContext

from lib.db import db

SECRET = os.environ.get("JWT_SECRET", "crm-dev-secret-change-me")
ALGO = "HS256"
COOKIE_NAME = "crm_session"
SESSION_HOURS = 12

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

SUPER_ADMIN = "SUPER_ADMIN"
SALES_MANAGER = "SALES_MANAGER"
SALES = "SALES"


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(raw, hashed)
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)


def set_session_cookie(response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=SESSION_HOURS * 3600,
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


async def current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Sesi tidak ditemukan, silakan login")
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi telah berakhir, silakan login kembali")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sesi tidak valid")
    user = await db.users.find_one(
        {"user_id": payload.get("sub")},
        {"_id": 0, "password_hash": 0},
    )
    if not user or user.get("status") != "Active":
        raise HTTPException(status_code=401, detail="Akun tidak aktif")
    return user


def require_roles(*roles: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke modul ini")
        return user

    return dep


async def visible_sales_ids(user: dict) -> Optional[list[str]]:
    """Sales ids this user may see. None = unrestricted (SUPER_ADMIN)."""
    role = user["role"]
    if role == SUPER_ADMIN:
        return None
    if role == SALES_MANAGER:
        team = await db.users.find({"manager_id": user["user_id"]}, {"_id": 0, "user_id": 1}).to_list(500)
        return [user["user_id"]] + [t["user_id"] for t in team]
    return [user["user_id"]]


async def scope_filter(user: dict, field: str = "sales_id") -> dict:
    ids = await visible_sales_ids(user)
    if ids is None:
        return {}
    return {field: {"$in": ids}}


async def write_audit(
    user: dict, action: str, module: str, record_id: str, old_value: Any = None, new_value: Any = None
) -> None:
    await db.audit_logs.insert_one(
        {
            "user_id": user["user_id"],
            "user_name": user.get("name", ""),
            "action": action,
            "module": module,
            "record_id": record_id,
            "old_value": None if old_value is None else str(old_value)[:500],
            "new_value": None if new_value is None else str(new_value)[:500],
            "timestamp": datetime.now(timezone.utc),
        }
    )
