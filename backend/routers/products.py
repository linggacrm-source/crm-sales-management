from datetime import datetime, timezone
from typing import Any, Optional
import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from lib.auth import SUPER_ADMIN, current_user, require_roles, write_audit
from lib.db import db
from lib.ids import next_code
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/products", tags=["products"])

LIST_PROJECTION = {
    "_id": 0,
    "product_id": 1,
    "product_code": 1,
    "product_name": 1,
    "brand": 1,
    "category": 1,
    "unit": 1,
    "default_price": 1,
    "supplier": 1,
    "distributor": 1,
    "status": 1,
}
SORTABLE = ["product_name", "product_code", "default_price", "category", "created_date"]


class ProductIn(BaseModel):
    product_code: Optional[str] = None
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    unit: str = "Unit"
    default_price: float = 0
    supplier: Optional[str] = None
    distributor: Optional[str] = None
    status: str = "Active"


class ProductRow(BaseModel):
    product_id: str
    product_code: Optional[str] = None
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    unit: str = "Unit"
    default_price: float = 0
    supplier: Optional[str] = None
    distributor: Optional[str] = None
    status: str = "Active"


class ProductListResponse(BaseModel):
    data: list[ProductRow]
    total: int
    page: int
    page_size: int


@router.get("/import/template")
async def product_import_template(user: dict = Depends(require_roles(SUPER_ADMIN))):
    headers = [
        "product_name", "brand", "category", "description", "unit",
        "default_price", "supplier", "distributor", "status",
    ]
    sample = [[
        "eBOX570", "Axiomtek", "Computing", "Industrial embedded system",
        "Unit", 0, "Wellracom", "", "Active",
    ]]
    output = io.BytesIO()
    pd.DataFrame(sample, columns=headers).to_excel(output, index=False, sheet_name="Product Import")
    output.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="product_import_template.xlsx"'},
    )


@router.post("/import")
async def import_products(file: UploadFile = File(...), user: dict = Depends(require_roles(SUPER_ADMIN))):
    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in {"xlsx", "xls"}:
        raise HTTPException(status_code=400, detail="Format file harus Excel XLSX atau XLS")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ukuran file maksimal 10 MB")
    try:
        df = pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"File tidak dapat dibaca: {exc}")

    if len(df) > 5000:
        raise HTTPException(status_code=400, detail="Maksimal 5.000 baris per upload")
    if df.empty:
        raise HTTPException(status_code=400, detail="Tidak ada data produk di file")

    aliases = {
        "product_name": ["product_name", "product name", "nama produk", "nama_product", "produk"],
        "brand": ["brand", "merek"],
        "category": ["category", "kategori"],
        "description": ["description", "deskripsi", "keterangan"],
        "unit": ["unit", "satuan"],
        "default_price": ["default_price", "default price", "harga default", "harga", "price"],
        "supplier": ["supplier", "pemasok"],
        "distributor": ["distributor"],
        "status": ["status", "product status", "status produk"],
    }
    normalized = {str(c).strip().lower(): c for c in df.columns}
    mapping: dict[str, Any] = {}
    for field, names in aliases.items():
        for name in names:
            if name in normalized:
                mapping[field] = normalized[name]
                break
    if "product_name" not in mapping:
        raise HTTPException(status_code=400, detail="Kolom wajib 'Nama Produk' / 'product_name' tidak ditemukan")

    now = datetime.now(timezone.utc)
    docs = []
    errors = []
    seen_names: set[str] = set()
    for index, raw in df.iterrows():
        row_no = int(index) + 2
        def value(field: str) -> str:
            col = mapping.get(field)
            if col is None:
                return ""
            value = raw[col]
            return str(value).strip() if value is not None else ""

        product_name = value("product_name")
        if not product_name:
            errors.append({"row": row_no, "message": "Nama Produk wajib diisi"})
            continue
        duplicate_key = product_name.lower()
        brand = value("brand")
        if brand:
            duplicate_key = f"{duplicate_key}|{brand.lower()}"
        if duplicate_key in seen_names:
            errors.append({"row": row_no, "message": "Duplikat produk di dalam file"})
            continue
        seen_names.add(duplicate_key)

        status = value("status") or "Active"
        if status not in {"Active", "Archived"}:
            errors.append({"row": row_no, "message": f"Status tidak valid: {status}"})
            continue
        price_text = value("default_price").replace(",", "").replace(".", "") if value("default_price") else "0"
        try:
            default_price = float(price_text or 0)
        except ValueError:
            errors.append({"row": row_no, "message": f"Harga default tidak valid: {value('default_price')}"})
            continue

        existing = await db.products.find_one({"product_name": product_name, "brand": brand})
        if existing:
            errors.append({"row": row_no, "message": "Produk dengan nama dan brand yang sama sudah ada"})
            continue

        product_id = await next_code("PRD")
        docs.append({
            "product_id": product_id,
            "product_code": product_id,
            "product_name": product_name,
            "brand": brand or None,
            "category": value("category") or None,
            "description": value("description") or None,
            "unit": value("unit") or "Unit",
            "default_price": default_price,
            "supplier": value("supplier") or None,
            "distributor": value("distributor") or None,
            "status": status,
            "created_date": now,
            "updated_date": now,
        })

    if docs:
        await db.products.insert_many(docs)
    await write_audit(user, "IMPORT", "Product", f"IMPORT-{now.strftime('%Y%m%d%H%M%S')}", None,
                      f"file={filename}; inserted={len(docs)}; errors={len(errors)}")
    return {
        "ok": True, "filename": filename, "total_rows": len(df),
        "inserted": len(docs), "error_count": len(errors), "errors": errors[:100],
    }


@router.get("/options", response_model=list[ProductRow])
async def product_options(search: Optional[str] = None, _: dict = Depends(current_user)):
    query: dict = {"status": "Active"}
    query.update(search_clause(search, ["product_name", "product_code", "brand"]))
    rows = await db.products.find(query, LIST_PROJECTION).sort([("product_name", 1)]).to_list(50)
    return [ProductRow(**r) for r in rows]


@router.get("", response_model=ProductListResponse)
async def list_products(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    _: dict = Depends(current_user),
):
    query: dict = {}
    query.update(search_clause(search, ["product_name", "product_code", "brand", "supplier"]))
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    result = await paginate(
        db.products, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "created_date"),
    )
    return ProductListResponse(**result)


@router.post("", response_model=ProductRow)
async def create_product(payload: ProductIn, user: dict = Depends(require_roles(SUPER_ADMIN))):
    now = datetime.now(timezone.utc)
    pid = await next_code("PRD")
    doc = payload.model_dump()
    doc.update(
        {
            "product_id": pid,
            "product_code": payload.product_code or pid,
            "created_date": now,
            "updated_date": now,
        }
    )
    await db.products.insert_one(dict(doc))
    await write_audit(user, "CREATE", "Product", pid, None, payload.product_name)
    return ProductRow(**doc)


@router.put("/{product_id}", response_model=ProductRow)
async def update_product(product_id: str, payload: ProductIn, user: dict = Depends(require_roles(SUPER_ADMIN))):
    existing = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_date"] = datetime.now(timezone.utc)
    await db.products.update_one({"product_id": product_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Product", product_id, existing.get("product_name"), updates.get("product_name"))
    return ProductRow(**{**existing, **updates})


@router.delete("/{product_id}")
async def archive_product(product_id: str, user: dict = Depends(require_roles(SUPER_ADMIN))):
    res = await db.products.update_one({"product_id": product_id}, {"$set": {"status": "Archived"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    await write_audit(user, "ARCHIVE", "Product", product_id, "Active", "Archived")
    return {"ok": True}
