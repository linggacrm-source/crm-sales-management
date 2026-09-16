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

    item_header = ParagraphStyle(
        "QuotationItemHeader",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#111827"),
    )

    story = []

    # ============================================================
    # HEADER
    # ============================================================

    company_name = "PT. WELLRACOM INDUSTRI KOMPUTINDO"

    logo_path = "/app/frontend/public/logo well.jpg"

    # Sedikit diperkecil agar proporsinya lebih ringan saat dicetak,
    # sementara posisi blok company text tetap sama seperti layout PDF.
    logo = Image(
        logo_path,
        width=19 * mm,
        height=19 * mm,
        kind="proportional",
    )

    company_header = [
        Paragraph(
            f"<b>{company_name}</b>",
            ParagraphStyle(
                "CompanyHeader",
                parent=normal,
                fontName="Helvetica-Bold",
                fontSize=11,
                leading=13,
                spaceAfter=1,
            ),
        ),
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

    header_left = Table(
        [[logo, company_header]],
        colWidths=[25 * mm, 80 * mm],
    )

    header_left.setStyle(
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

    items = doc.get("items") or []

    has_discount = any(
        float(item.get("discount") or 0) > 0
        for item in items
    )

    item_header_row = [
        Paragraph("<b>NO</b>", item_header),
        Paragraph("<b>ITEMS / SPECIFICATION</b>", item_header),
        Paragraph("<b>UNIT PRICE</b>", item_header),
        Paragraph("<b>QTY</b>", item_header),
    ]

    if has_discount:
        item_header_row.append(
            Paragraph("<b>DISCOUNT</b>", item_header)
        )

    item_header_row.append(
        Paragraph("<b>AMOUNT</b>", item_header)
    )

    item_rows = [item_header_row]

    def money(value):
        return f"Rp {float(value or 0):,.0f}".replace(",", ".")

    for idx, item in enumerate(items, start=1):
        description = str(item.get("description") or "-")

        description_html = (
            description
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .replace("\n", "<br/>")
        )

        qty = item.get("qty") or 0
        unit = str(item.get("unit") or "Unit")
        unit_price = float(item.get("unit_price") or 0)
        discount = float(item.get("discount") or 0)
        subtotal = float(item.get("subtotal") or 0)

        row = [
            Paragraph(str(idx), center),
            Paragraph(description_html, normal),
            Paragraph(money(unit_price), right),
            Paragraph(f"{qty:g} {unit}", center),
        ]

        if has_discount:
            row.append(
                Paragraph(money(discount), right)
            )

        row.append(
            Paragraph(money(subtotal), right)
        )

        item_rows.append(row)

    if has_discount:
        item_col_widths = [9 * mm, 78 * mm, 30 * mm, 18 * mm, 25 * mm, 20 * mm]
    else:
        item_col_widths = [9 * mm, 92 * mm, 30 * mm, 18 * mm, 31 * mm]

    item_table = Table(
        item_rows,
        colWidths=item_col_widths,
        repeatRows=1,
    )

    item_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#111827")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )

    story.append(item_table)
    story.append(Spacer(1, 4 * mm))

    # ============================================================
    # TOTALS
    # ============================================================

    subtotal_value = float(doc.get("subtotal") or 0)
    discount_value = float(doc.get("discount") or 0)
    tax_value = float(doc.get("tax") or 0)
    grand_total = float(doc.get("grand_total") or 0)

    totals_rows = [
        [Paragraph("SUBTOTAL", right), Paragraph(money(subtotal_value), right)],
    ]

    if discount_value > 0:
        totals_rows.append(
            [Paragraph("DISCOUNT", right), Paragraph(money(discount_value), right)]
        )

    totals_rows.extend(
        [
            [
                Paragraph(f"PPN {float(doc.get('tax_percent') or 0):g}%", right),
                Paragraph(money(tax_value), right),
            ],
            [Paragraph("<b>GRAND TOTAL</b>", right), Paragraph(f"<b>{money(grand_total)}</b>", right)],
        ]
    )

    totals_table = Table(
        totals_rows,
        colWidths=[35 * mm, 35 * mm],
    )

    totals_style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
    ]
    totals_table.setStyle(TableStyle(totals_style))

    totals_wrapper = Table(
        [["", totals_table]],
        colWidths=[110 * mm, 70 * mm],
    )
    totals_wrapper.setStyle(
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

    story.append(totals_wrapper)
    story.append(Spacer(1, 4 * mm))

    # ============================================================
    # TERMS + SIGNATURE
    # ============================================================

    terms = [Paragraph("<b>TERMS &amp; CONDITIONS</b>", section)]

    payment_term = doc.get("payment_term") or "-"
    delivery_term = doc.get("delivery_term") or "-"
    validity_date = doc.get("validity_date") or "-"

    terms.extend(
        [
            Paragraph(f"• Payment: {payment_term}", small),
            Paragraph(f"• Pengiriman: {delivery_term}", small),
            Paragraph(f"• Validitas: s/d {validity_date}", small),
        ]
    )

    signature_flow = []
    signature_flow.append(Paragraph("<b>DIGITALLY APPROVED</b>", section))

    signature_name = doc.get("signature_name") or doc.get("sales_name") or "Sales"
    signature_title = doc.get("signature_title") or "Sales"

    signature_image_path = doc.get("signature_image")
    if signature_image_path:
        try:
            signature_flow.append(Image(signature_image_path, width=35 * mm, height=18 * mm, kind="proportional"))
        except Exception:
            signature_flow.append(Spacer(1, 18 * mm))
    else:
        signature_flow.append(Spacer(1, 18 * mm))

    signature_flow.extend(
        [
            Paragraph(f"<b>{signature_name}</b>", normal),
            Paragraph(signature_title, small),
        ]
    )

    signature_table = Table(
        [[terms, signature_flow]],
        colWidths=[100 * mm, 80 * mm],
    )
    signature_table.setStyle(
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

    story.append(signature_table)
    story.append(Spacer(1, 4 * mm))

    # ============================================================
    # FOOTER
    # ============================================================

    footer = Table(
        [[
            Paragraph(f"Quotation {doc.get('quotation_number') or '-'}", small),
            Paragraph("This document is digitally generated.", ParagraphStyle("FooterRight", parent=small, alignment=TA_RIGHT)),
        ]],
        colWidths=[90 * mm, 90 * mm],
    )
    footer.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#9CA3AF")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    story.append(footer)

    def draw_page_number(canvas, doc_obj):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawRightString(A4[0] - 15 * mm, 8 * mm, f"Page {doc_obj.page}")
        canvas.restoreState()

    pdf_doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=f"Quotation {doc.get('quotation_number') or '-'}",
        author=company_name,
    )

    pdf_doc.build(story, onFirstPage=draw_page_number, onLaterPages=draw_page_number)

    buffer.seek(0)

    filename = f"Quotation_{quotation_number}.pdf"

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
