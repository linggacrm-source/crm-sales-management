from datetime import datetime, timezone
import io
import os
import re
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from lib.auth import SALES, current_user, visible_sales_ids, write_audit
from lib.db import db
from lib.ids import next_code

router = APIRouter(prefix="/customers", tags=["customers"])

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ROWS = 5000

FIELD_ALIASES = {
    "customer_id": ["customer_id", "customer id", "id customer", "id_customer"],
    "customer_name": ["customer_name", "customer name", "nama customer", "nama_customer", "customer"],
    "company": ["company", "perusahaan", "nama perusahaan", "nama_perusahaan"],
    "industry": ["industry", "industri"],
    "address": ["address", "alamat"],
    "city": ["city", "kota"],
    "province": ["province", "provinsi"],
    "phone": ["phone", "telepon", "telephone", "no telepon", "no_telp", "nomor telepon"],
    "email": ["email", "e-mail", "email customer"],
    "pic_name": ["pic_name", "pic name", "nama pic", "pic", "contact person", "contact_person"],
    "pic_position": ["pic_position", "pic position", "jabatan pic", "jabatan"],
    "source": ["source", "sumber"],
    "sales_id": ["sales_id", "sales id", "id sales", "id_sales", "sales"],
    "status": ["status", "customer status", "status customer"],
    "notes": ["notes", "catatan", "keterangan"],
}

IMPORT_FIELDS = [
    "customer_id", "customer_name", "company", "industry", "address", "city", "province",
    "phone", "email", "pic_name", "pic_position", "source", "sales_id", "status", "notes",
]


def clean_header(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def clean_value(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def normalize_columns(columns: list[Any]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for field, names in FIELD_ALIASES.items():
        for name in names:
            aliases[clean_header(name)] = field
    result: dict[str, str] = {}
    for column in columns:
        key = clean_header(column)
        if key in aliases:
            result[str(column)] = aliases[key]
    return result


async def _sales_name(sales_id: str | None) -> str | None:
    if not sales_id:
        return None
    doc = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1})
    return doc["name"] if doc else None


def _duplicate_key(row: dict[str, str]) -> dict[str, Any] | None:
    email = row.get("email", "").lower()
    if email:
        return {"email": email}
    name = row.get("customer_name", "").lower()
    company = row.get("company", "").lower()
    if name and company:
        return {"customer_name": name, "company": company}
    return None


@router.post("/import")
async def import_customers(file: UploadFile = File(...), user: dict = Depends(current_user)):
    filename = file.filename or ""
    ext = os.path.splitext(filename.lower())[1]
    if ext not in {".csv", ".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Format file harus CSV, XLSX, atau XLS")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="Ukuran file maksimal 10 MB")

    try:
        if ext == ".csv":
            try:
                df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False, encoding="latin-1")
        else:
            df = pd.read_excel(io.BytesIO(content), dtype=str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"File tidak dapat dibaca: {exc}")

    if len(df) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Maksimal {MAX_ROWS:,} baris per upload")
    if df.empty:
        raise HTTPException(status_code=400, detail="Tidak ada data customer di file")

    mapping = normalize_columns(list(df.columns))
    if "customer_name" not in mapping.values():
        raise HTTPException(
            status_code=400,
            detail="Kolom wajib 'Nama Customer' / 'customer_name' tidak ditemukan",
        )

    sales_ids = await visible_sales_ids(user)
    sales_cache: dict[str, str | None] = {}
    docs: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    skipped = 0
    updated = 0
    seen_keys: set[str] = set()
    now = datetime.now(timezone.utc)

    for index, raw in df.iterrows():
        excel_row = int(index) + 2
        row: dict[str, str] = {field: "" for field in IMPORT_FIELDS}
        for source_column, field in mapping.items():
            row[field] = clean_value(raw[source_column])

        if not row["customer_name"]:
            errors.append({"row": excel_row, "message": "Nama Customer wajib diisi"})
            continue

        status = row["status"] or "Active"
        if status not in {"Active", "Inactive", "Archived"}:
            errors.append({"row": excel_row, "message": f"Status tidak valid: {status}"})
            continue

        sales_id = row["sales_id"] or user["user_id"]
        if user["role"] == SALES:
            sales_id = user["user_id"]
        elif sales_ids is not None and sales_id not in sales_ids:
            errors.append({"row": excel_row, "message": f"Sales {sales_id} tidak berada dalam scope akun Anda"})
            continue

        if sales_id not in sales_cache:
            sales_cache[sales_id] = await _sales_name(sales_id)
        if sales_cache[sales_id] is None:
            errors.append({"row": excel_row, "message": f"Sales ID tidak ditemukan: {sales_id}"})
            continue

        duplicate_key = _duplicate_key(row)
        key_signature = str(duplicate_key).lower() if duplicate_key else None
        if key_signature and key_signature in seen_keys:
            skipped += 1
            continue
        if key_signature:
            seen_keys.add(key_signature)

        base_doc = {field: (row[field] or None) for field in IMPORT_FIELDS if field != "customer_id"}
        base_doc["status"] = status
        base_doc["sales_id"] = sales_id
        base_doc["sales_name"] = sales_cache[sales_id]
        base_doc["updated_date"] = now

        existing = None
        if row["customer_id"]:
            existing = await db.customers.find_one({"customer_id": row["customer_id"]})
            if existing and sales_ids is not None and existing.get("sales_id") not in sales_ids:
                errors.append({"row": excel_row, "message": "Customer ID berada di luar scope akun Anda"})
                continue
        elif duplicate_key:
            existing = await db.customers.find_one(duplicate_key)

        if existing:
            await db.customers.update_one({"_id": existing["_id"]}, {"$set": base_doc})
            updated += 1
            continue

        customer_id = row["customer_id"] or await next_code("CUS")
        base_doc.update({"customer_id": customer_id, "created_date": now})
        docs.append(base_doc)

    if docs:
        await db.customers.insert_many(docs)

    total_processed = len(docs) + updated + skipped
    await write_audit(
        user,
        "IMPORT",
        "Customer",
        f"IMPORT-{now.strftime('%Y%m%d%H%M%S')}",
        None,
        f"file={filename}; inserted={len(docs)}; updated={updated}; skipped={skipped}; errors={len(errors)}",
    )

    return {
        "ok": True,
        "filename": filename,
        "total_rows": len(df),
        "inserted": len(docs),
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:100],
        "error_count": len(errors),
        "processed": total_processed,
    }
