from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from lib.auth import (
    clear_session_cookie,
    create_token,
    current_user,
    hash_password,
    set_session_cookie,
    verify_password,
    write_audit,
)
from lib.db import db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


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

    # Recovery for the designated production Super Admin account: after the
    # password is successfully verified, ensure USR-0001 is active in DB.
    if user.get("user_id") == "USR-0001" and user.get("status") != "Active":
        await db.users.update_one(
            {"user_id": "USR-0001"},
            {"$set": {"status": "Active", "updated_date": datetime.now(timezone.utc)}},
        )
        user["status"] = "Active"

    if user.get("status") != "Active":
        raise HTTPException(status_code=403, detail="Akun tidak aktif, hubungi administrator")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"last_login": datetime.now(timezone.utc)}}
    )
    set_session_cookie(response, create_token(user["user_id"]))
    return MeResponse(**user)


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    user: dict = Depends(current_user),
):
    current_password = payload.current_password
    new_password = payload.new_password

    if not verify_password(current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Password saat ini salah")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password baru minimal 8 karakter")
    if new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Konfirmasi password baru tidak cocok")
    if new_password == current_password:
        raise HTTPException(status_code=400, detail="Password baru harus berbeda dari password saat ini")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "password_hash": hash_password(new_password),
                "must_change_password": False,
                "updated_date": datetime.now(timezone.utc),
            }
        },
    )
    await write_audit(user, "CHANGE_PASSWORD", "User", user["user_id"])

    # End the current session so the new password takes effect immediately and
    # any previously issued session cannot remain active after a credential change.
    clear_session_cookie(response)
    return {"ok": True, "message": "Password berhasil diubah. Silakan login kembali."}


@router.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
async def me(user: dict = Depends(current_user)):
    return MeResponse(**user)
