from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from lib.auth import (
    clear_session_cookie,
    create_token,
    current_user,
    set_session_cookie,
    verify_password,
)
from lib.db import db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class MeResponse(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    manager_id: str | None = None
    phone: str | None = None
    status: str
    must_change_password: bool = False
    signature_image: str | None = None
    signature_title: str | None = None


@router.post("/login", response_model=MeResponse)
async def login(payload: LoginRequest, response: Response):
    user = await db.users.find_one({"email": payload.email.strip().lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    if user.get("status") != "Active":
        raise HTTPException(status_code=403, detail="Akun tidak aktif, hubungi administrator")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"last_login": datetime.now(timezone.utc)}}
    )
    set_session_cookie(response, create_token(user["user_id"]))
    return MeResponse(**user)


@router.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
async def me(user: dict = Depends(current_user)):
    return MeResponse(**user)
