from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import SALES, current_user, scope_filter, write_audit
from lib.dates import today_iso
from lib.db import db
from lib.ids import next_code, next_quotation_number, sales_initial
from lib.query import paginate, search_clause, sort_spec

router = APIRouter(prefix="/quotations", tags=["quotations"])

STATUSES = ["Draft", "Sent", "Negotiation", "Approved", "Rejected", "Expired", "Converted"]

LIST_PROJECTION = {
    "_id": 0,
    "quotation_id": 1,
    "quotation_number": 1,
    "quotation_date": 1,
    "customer_id": 1,
    "customer_name": 1,
    "sales_id": 1,
    "sales_name": 1,
    "grand_total": 1,
    "status": 1,
    "validity_date": 1,
}
SORTABLE = ["quotation_number", "quotation_date", "grand_total", "status", "created_date"]


class QuotationItemIn(BaseModel):
    product_id: Optional[str] = None
    description: str
    qty: float = 1
    unit: str = "Unit"
    unit_price: float = 0
    discount: float = 0


class QuotationItem(QuotationItemIn):
    quotation_item_id: str
    subtotal: float = 0


class QuotationIn(BaseModel):
    customer_id: str
    opportunity_id: Optional[str] = None
    sales_id: Optional[str] = None
    quotation_date: Optional[str] = None
    validity_date: Optional[str] = None
    payment_term: Optional[str] = None
    delivery_term: Optional[str] = None
    notes: Optional[str] = None
    discount: float = 0
    tax_percent: float = 11
    status: str = "Draft"
    items: list[QuotationItemIn] = []


class StatusChange(BaseModel):
    status: str


class QuotationRow(BaseModel):
    quotation_id: str
    quotation_number: str
    quotation_date: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    sales_id: Optional[str] = None
    sales_name: Optional[str] = None
    grand_total: float = 0
    status: str
    validity_date: Optional[str] = None


class QuotationDetail(QuotationRow):
    opportunity_id: Optional[str] = None
    payment_term: Optional[str] = None
    delivery_term: Optional[str] = None
    notes: Optional[str] = None
    subtotal: float = 0
    discount: float = 0
    tax_percent: float = 11
    tax: float = 0
    items: list[QuotationItem] = []
    # customer contact snapshot + signature, resolved for the printable document
    customer_company: Optional[str] = None
    customer_pic_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    signature_image: Optional[str] = None
    signature_name: Optional[str] = None
    signature_title: Optional[str] = None


class QuotationListResponse(BaseModel):
    data: list[QuotationRow]
    total: int
    page: int
    page_size: int


class ConvertResponse(BaseModel):
    po_id: str
    po_number: str


class ConvertRequest(BaseModel):
    """The customer's own PO number/date — this CRM records the PO it receives."""

    po_number: str
    po_date: Optional[str] = None


def _compute(items: list[QuotationItemIn], discount: float, tax_percent: float) -> dict:
    built: list[dict] = []
    subtotal = 0.0
    for idx, it in enumerate(items, start=1):
        line = round(it.qty * it.unit_price - it.discount, 2)
        subtotal += line
        built.append({**it.model_dump(), "quotation_item_id": f"QTI-{idx:03d}", "subtotal": line})
    after_disc = subtotal - discount
    tax = round(after_disc * tax_percent / 100, 2)
    return {
        "items": built,
        "subtotal": round(subtotal, 2),
        "tax": tax,
        "grand_total": round(after_disc + tax, 2),
    }


@router.get("", response_model=QuotationListResponse)
async def list_quotations(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    sales_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user: dict = Depends(current_user),
):
    query = await scope_filter(user)
    query.update(search_clause(search, ["quotation_number", "customer_name", "quotation_id"]))
    if status:
        query["status"] = status
    if sales_id:
        query["sales_id"] = sales_id
    if customer_id:
        query["customer_id"] = customer_id
    result = await paginate(
        db.quotations, query, page, page_size, LIST_PROJECTION,
        sort_spec(sort_by, sort_dir, SORTABLE, "created_date"),
    )
    return QuotationListResponse(**result)


@router.get("/{quotation_id}", response_model=QuotationDetail)
async def get_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    return QuotationDetail(**await _decorate(doc))


async def _decorate(doc: dict) -> dict:
    """Attach the customer contact block and the sales user's saved digital signature."""
    cust = await db.customers.find_one(
        {"customer_id": doc.get("customer_id")},
        {"_id": 0, "company": 1, "pic_name": 1, "email": 1, "phone": 1},
    )
    signer = await db.users.find_one(
        {"user_id": doc.get("sales_id")},
        {"_id": 0, "name": 1, "role": 1, "signature_image": 1, "signature_title": 1},
    )
    return {
        **doc,
        "customer_company": (cust or {}).get("company"),
        "customer_pic_name": (cust or {}).get("pic_name"),
        "customer_email": (cust or {}).get("email"),
        "customer_phone": (cust or {}).get("phone"),
        "signature_image": (signer or {}).get("signature_image"),
        "signature_name": (signer or {}).get("name"),
        "signature_title": (signer or {}).get("signature_title") or (signer or {}).get("role"),
    }



@router.post("", response_model=QuotationDetail)
async def create_quotation(payload: QuotationIn, user: dict = Depends(current_user)):
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1})
    if not cust:
        raise HTTPException(status_code=400, detail="Customer tidak ditemukan")
    sales_id = user["user_id"] if user["role"] == SALES else (payload.sales_id or user["user_id"])
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1})
    totals = _compute(payload.items, payload.discount, payload.tax_percent)
    now = datetime.now(timezone.utc)
    doc = payload.model_dump()
    doc.update(totals)
    doc.update(
        {
            "quotation_id": await next_code("QTN"),
            "quotation_number": await next_quotation_number(sales["name"] if sales else None),
            "quotation_date": payload.quotation_date or today_iso(),
            "sales_id": sales_id,
            "sales_name": sales["name"] if sales else None,
            "customer_name": cust["customer_name"],
            "created_date": now,
            "updated_date": now,
        }
    )
    await db.quotations.insert_one(dict(doc))
    await write_audit(user, "CREATE", "Quotation", doc["quotation_number"], None, doc["grand_total"])
    return QuotationDetail(**await _decorate(doc))


@router.put("/{quotation_id}", response_model=QuotationDetail)
async def update_quotation(quotation_id: str, payload: QuotationIn, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    existing = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    updates = payload.model_dump()
    updates.update(_compute(payload.items, payload.discount, payload.tax_percent))
    if user["role"] == SALES:
        updates.pop("sales_id", None)
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1})
    updates["customer_name"] = cust["customer_name"] if cust else existing.get("customer_name")
    updates["updated_date"] = datetime.now(timezone.utc)
    await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Quotation", existing.get("quotation_number", quotation_id),
                      existing.get("grand_total"), updates.get("grand_total"))
    return QuotationDetail(**await _decorate({**existing, **updates}))


@router.patch("/{quotation_id}/status", response_model=QuotationDetail)
async def change_status(quotation_id: str, payload: StatusChange, user: dict = Depends(current_user)):
    if payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Status tidak valid")
    scope = await scope_filter(user)
    existing = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    updates = {"status": payload.status, "updated_date": datetime.now(timezone.utc)}
    await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": updates})
    await write_audit(user, "UPDATE", "Quotation", existing.get("quotation_number", quotation_id),
                      f"Status: {existing.get('status')}", f"Status: {payload.status}")
    return QuotationDetail(**await _decorate({**existing, **updates}))


@router.post("/{quotation_id}/duplicate", response_model=QuotationDetail)
async def duplicate_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    src = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    now = datetime.now(timezone.utc)
    doc = {
        **src,
        "quotation_id": await next_code("QTN"),
        "quotation_number": await next_quotation_number(src.get("sales_name")),
        "status": "Draft",
        "quotation_date": today_iso(),
        "created_date": now,
        "updated_date": now,
    }
    await db.quotations.insert_one(dict(doc))
    await write_audit(user, "DUPLICATE", "Quotation", doc["quotation_number"], quotation_id, doc["quotation_id"])
    return QuotationDetail(**await _decorate(doc))


@router.post("/{quotation_id}/convert-to-po", response_model=ConvertResponse)
async def convert_to_po(quotation_id: str, payload: ConvertRequest, user: dict = Depends(current_user)):
    """Records the customer's PO against this quotation.

    Reuses the quotation's customer_id / sales_id / product_ids — never creates new master records.
    The PO number is the number printed on the CUSTOMER's own purchase order document.
    """
    scope = await scope_filter(user)
    qt = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not qt:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    if qt.get("status") == "Converted":
        raise HTTPException(status_code=400, detail="Quotation ini sudah dikonversi menjadi PO")
    po_number = (payload.po_number or "").strip()
    if not po_number:
        raise HTTPException(status_code=400, detail="Nomor PO customer wajib diisi")
    if await db.purchase_orders.find_one(
        {"customer_id": qt["customer_id"], "po_number": po_number}, {"_id": 1}
    ):
        raise HTTPException(
            status_code=400, detail=f"Nomor PO '{po_number}' sudah terdaftar untuk customer ini"
        )
    now = datetime.now(timezone.utc)
    po_items = [
        {
            "po_item_id": f"POI-{i:03d}",
            "product_id": it.get("product_id"),
            "description": it.get("description"),
            "qty": it.get("qty", 0),
            "unit": it.get("unit", "Unit"),
            "unit_price": it.get("unit_price", 0),
            "subtotal": it.get("subtotal", 0),
        }
        for i, it in enumerate(qt.get("items", []), start=1)
    ]
    po = {
        "po_id": await next_code("POR"),
        "po_number": po_number,
        "po_date": payload.po_date or today_iso(),
        "customer_id": qt["customer_id"],
        "customer_name": qt.get("customer_name"),
        "quotation_id": qt["quotation_id"],
        "quotation_number": qt.get("quotation_number"),
        "sales_id": qt.get("sales_id"),
        "sales_name": qt.get("sales_name"),
        "po_value": qt.get("grand_total", 0),
        "delivery_address": None,
        "payment_term": qt.get("payment_term"),
        "notes": f"PO customer atas quotation {qt.get('quotation_number')}",
        "status": "Received",
        "items": po_items,
        "document_name": None,
        "created_date": now,
        "updated_date": now,
    }
    await db.purchase_orders.insert_one(dict(po))
    await db.quotations.update_one(
        {"quotation_id": quotation_id}, {"$set": {"status": "Converted", "updated_date": now}}
    )
    await write_audit(user, "CONVERT", "Quotation", qt.get("quotation_number", quotation_id),
                      qt.get("status"), f"PO {po['po_number']}")
    return ConvertResponse(po_id=po["po_id"], po_number=po["po_number"])


@router.delete("/{quotation_id}")
async def delete_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    res = await db.quotations.delete_one({"quotation_id": quotation_id, **scope})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    await write_audit(user, "DELETE", "Quotation", quotation_id)
    return {"ok": True}
