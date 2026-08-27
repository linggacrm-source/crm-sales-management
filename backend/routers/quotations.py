from datetime import datetime, timezone
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Image,
)

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




@router.get("/{quotation_id}/pdf")
async def download_quotation_pdf(
    quotation_id: str,
    request: Request,
    user: dict = Depends(current_user),
):
    """
    Generate quotation PDF server-side with ReportLab.

    Browser hanya menerima file PDF final.
    Tidak menggunakan html2canvas/jsPDF sehingga tidak membebani
    halaman React dan tidak menyebabkan browser freeze.
    """
    scope = await scope_filter(user)

    doc = await db.quotations.find_one(
        {"quotation_id": quotation_id, **scope},
        {"_id": 0},
    )

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Quotation tidak ditemukan",
        )

    doc = await _decorate(doc)

    buffer = BytesIO()

    quotation_number = (
        str(doc.get("quotation_number") or quotation_id)
        .replace("/", "_")
        .replace("\\", "_")
        .replace(" ", "_")
    )

    customer_company = (
        doc.get("customer_company")
        or doc.get("customer_name")
        or "-"
    )

    styles = getSampleStyleSheet()

    normal = ParagraphStyle(
        "QuotationNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        spaceAfter=2,
    )

    small = ParagraphStyle(
        "QuotationSmall",
        parent=normal,
        fontSize=7.5,
        leading=9,
    )

    title = ParagraphStyle(
        "QuotationTitle",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=20,
        alignment=TA_RIGHT,
    )

    section = ParagraphStyle(
        "QuotationSection",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
    )

    right = ParagraphStyle(
        "QuotationRight",
        parent=normal,
        alignment=TA_RIGHT,
    )

    center = ParagraphStyle(
        "QuotationCenter",
        parent=normal,
        alignment=TA_CENTER,
    )

    # Header tabel item: background gelap + teks putih
    item_header = ParagraphStyle(
        "QuotationItemHeader",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        alignment=TA_CENTER,
        textColor=colors.white,
    )

    story = []

    # ============================================================
    # HEADER
    # ============================================================

    company_name = "PT. WELLRACOM INDUSTRI KOMPUTINDO"

    logo_path = "/app/frontend/public/wellracom-logo.png"

    logo = Image(
        logo_path,
        width=42 * mm,
        height=16 * mm,
        kind="proportional",
    )

    header_left = [
        logo,
        Spacer(1, 2 * mm),
        Paragraph(
            "Industrial Computing • Automation • Communication",
            small,
        ),
        Spacer(1, 1 * mm),
        Paragraph(
            "EPIWALK A707 Rasuna Epicentrum Kuningan, Jakarta Selatan",
            small,
        ),
    ]

    header_right = [
        Paragraph("QUOTATION", title),
        Spacer(1, 2 * mm),
        Paragraph(
            f"<b>No:</b> {doc.get('quotation_number') or '-'}",
            right,
        ),
        Paragraph(
            f"<b>Date:</b> {doc.get('quotation_date') or '-'}",
            right,
        ),
        Paragraph(
            f"<b>Valid Until:</b> {doc.get('validity_date') or '-'}",
            right,
        ),
    ]

    header = Table(
        [[header_left, header_right]],
        colWidths=[105 * mm, 75 * mm],
    )

    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    story.append(header)
    story.append(Spacer(1, 5 * mm))

    # ============================================================
    # CUSTOMER
    # ============================================================

    customer_data = [
        [
            Paragraph("<b>TO:</b>", section),
            Paragraph(
                f"<b>{customer_company}</b>",
                normal,
            ),
        ],
        [
            Paragraph("<b>Attention:</b>", small),
            Paragraph(
                str(doc.get("customer_pic_name") or "-"),
                normal,
            ),
        ],
        [
            Paragraph("<b>Email:</b>", small),
            Paragraph(
                str(doc.get("customer_email") or "-"),
                normal,
            ),
        ],
        [
            Paragraph("<b>Phone:</b>", small),
            Paragraph(
                str(doc.get("customer_phone") or "-"),
                normal,
            ),
        ],
    ]

    customer_table = Table(
        customer_data,
        colWidths=[28 * mm, 152 * mm],
    )

    customer_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ]
        )
    )

    story.append(customer_table)
    story.append(Spacer(1, 5 * mm))

    # ============================================================
    # ITEMS
    # ============================================================

    item_rows = [
        [
            Paragraph("<b>No.</b>", item_header),
            Paragraph("<b>Description</b>", item_header),
            Paragraph("<b>Qty</b>", item_header),
            Paragraph("<b>Unit</b>", item_header),
            Paragraph("<b>Unit Price</b>", item_header),
            Paragraph("<b>Discount</b>", item_header),
            Paragraph("<b>Subtotal</b>", item_header),
        ]
    ]

    for idx, item in enumerate(doc.get("items") or [], start=1):
        description = str(item.get("description") or "-")
        qty = item.get("qty") or 0
        unit = str(item.get("unit") or "Unit")
        unit_price = float(item.get("unit_price") or 0)
        discount = float(item.get("discount") or 0)
        subtotal = float(item.get("subtotal") or 0)

        def money(value):
            return f"Rp {value:,.0f}".replace(",", ".")

        item_rows.append(
            [
                Paragraph(str(idx), center),
                Paragraph(description, normal),
                Paragraph(f"{qty:g}", center),
                Paragraph(unit, center),
                Paragraph(money(unit_price), right),
                Paragraph(money(discount), right),
                Paragraph(money(subtotal), right),
            ]
        )

    item_table = Table(
        item_rows,
        colWidths=[
            9 * mm,
            65 * mm,
            14 * mm,
            18 * mm,
            27 * mm,
            22 * mm,
            25 * mm,
        ],
        repeatRows=1,
    )

    item_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#777777")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, 0), 5),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
                ("TOPPADDING", (0, 1), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
            ]
        )
    )

    story.append(item_table)
    story.append(Spacer(1, 5 * mm))

    # ============================================================
    # TOTALS
    # ============================================================

    def money(value):
        return f"Rp {float(value or 0):,.0f}".replace(",", ".")

    totals_data = [
        ["Subtotal", money(doc.get("subtotal"))],
        ["Discount", money(doc.get("discount"))],
        [
            f"Tax ({float(doc.get('tax_percent') or 0):g}%)",
            money(doc.get("tax")),
        ],
        ["GRAND TOTAL", money(doc.get("grand_total"))],
    ]

    totals_table = Table(
        totals_data,
        colWidths=[40 * mm, 40 * mm],
        hAlign="RIGHT",
    )

    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("FONTNAME", (0, 0), (-1, -2), "Helvetica"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )

    story.append(totals_table)
    story.append(Spacer(1, 6 * mm))

    # ============================================================
    # TERMS / NOTES
    # ============================================================

    story.append(Paragraph("TERMS & CONDITIONS", section))
    story.append(Spacer(1, 2 * mm))

    notes = doc.get("notes")

    if notes:
        note_lines = str(notes).splitlines()
    else:
        note_lines = [
            f"Payment: {doc.get('payment_term') or '-'}",
            f"Pengiriman: {doc.get('delivery_term') or '-'}",
            f"Validitas: s/d {doc.get('validity_date') or '-'}",
        ]

    for line in note_lines:
        if str(line).strip():
            story.append(
                Paragraph(
                    f"• {str(line)}",
                    small,
                )
            )

    story.append(Spacer(1, 10 * mm))

    # ============================================================
    # DIGITAL SIGNATURE - INTERNAL
    # ============================================================

    signature_name = doc.get("signature_name") or doc.get("sales_name") or "-"
    signature_title = doc.get("signature_title") or "Sales"

    # URL quotation untuk QR Code.
    # Mengikuti domain yang sedang digunakan oleh browser.
    base_url = str(request.base_url).rstrip("/")
    verification_url = f"{base_url}/quotations/{quotation_id}"

    # ============================================================
    # DIGITAL APPROVAL
    # Template mengikuti desain approval internal:
    #
    # DIGITALLY APPROVED
    # Aripin Manager
    # SALES_MANAGER
    # ============================================================

    digital_approved_style = ParagraphStyle(
        "DigitalApproved",
        parent=small,
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#444444"),
        spaceAfter=1,
    )

    digital_approved_name_style = ParagraphStyle(
        "DigitalApprovedName",
        parent=small,
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#444444"),
        spaceAfter=1,
    )

    digital_approved_role_style = ParagraphStyle(
        "DigitalApprovedRole",
        parent=small,
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#444444"),
    )

    signature_data = [[
        Paragraph(
            "DIGITALLY APPROVED",
            digital_approved_style,
        )
    ], [
        Paragraph(
            str(signature_name),
            digital_approved_name_style,
        )
    ], [
        Paragraph(
            str(signature_title),
            digital_approved_role_style,
        )
    ]]

    signature_table = Table(
        signature_data,
        colWidths=[70 * mm],
        hAlign="RIGHT",
    )

    signature_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    story.append(signature_table)

    story.append(Spacer(1, 5 * mm))

    # ============================================================
    # FOOTER
    # ============================================================

    story.append(
        Table(
            [[
                Paragraph(
                    f"Quotation {doc.get('quotation_number') or quotation_id}",
                    small,
                ),
                Paragraph(
                    "This document is digitally generated.",
                    ParagraphStyle(
                        "FooterRight",
                        parent=small,
                        alignment=TA_RIGHT,
                    ),
                ),
            ]],
            colWidths=[90 * mm, 90 * mm],
            style=TableStyle(
                [
                    ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#555555")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )
    )

    def add_page_number(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(
            A4[0] - 10 * mm,
            6 * mm,
            f"Page {document.page}",
        )
        canvas.restoreState()

    pdf = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=f"Quotation {quotation_number}",
        author=company_name,
    )

    pdf.build(
        story,
        onFirstPage=add_page_number,
        onLaterPages=add_page_number,
    )

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{quotation_number}.pdf"'
            )
        },
    )


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
