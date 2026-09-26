from datetime import datetime, timezone
from email.message import EmailMessage
from io import BytesIO
import base64
import re
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
    discount_type: str = "amount"
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
    discount_type: str = "amount"
    discount_input: Optional[float] = None
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


class QuotationEmailRequest(BaseModel):
    to: str
    cc: Optional[str] = None
    subject: str
    body: str


class QuotationEmailDraft(BaseModel):
    to: str
    subject: str
    body: str
    quotation_number: str


class ConvertResponse(BaseModel):
    po_id: str
    po_number: str


class ConvertRequest(BaseModel):
    po_number: str
    po_date: Optional[str] = None


def _compute(items: list[QuotationItemIn], discount: float, discount_type: str, tax_percent: float) -> dict:
    built: list[dict] = []
    subtotal = 0.0
    for idx, it in enumerate(items, start=1):
        line = round(it.qty * it.unit_price - it.discount, 2)
        subtotal += line
        built.append({**it.model_dump(), "quotation_item_id": f"QTI-{idx:03d}", "subtotal": line})
    discount_amount = round(subtotal * discount / 100, 2) if discount_type == "percent" else round(discount, 2)
    after_disc = max(0.0, subtotal - discount_amount)
    tax = round(after_disc * tax_percent / 100, 2)
    return {"items": built, "subtotal": round(subtotal, 2), "discount": discount_amount, "tax": tax, "grand_total": round(after_disc + tax, 2)}


@router.get("", response_model=QuotationListResponse)
async def list_quotations(page: int = 1, page_size: int = 25, search: Optional[str] = None, status: Optional[str] = None, sales_id: Optional[str] = None, customer_id: Optional[str] = None, sort_by: Optional[str] = None, sort_dir: Optional[str] = None, user: dict = Depends(current_user)):
    query = await scope_filter(user)
    query.update(search_clause(search, ["quotation_number", "customer_name", "quotation_id"]))
    if status: query["status"] = status
    if sales_id: query["sales_id"] = sales_id
    if customer_id: query["customer_id"] = customer_id
    result = await paginate(db.quotations, query, page, page_size, LIST_PROJECTION, sort_spec(sort_by, sort_dir, SORTABLE, "created_date"))
    return QuotationListResponse(**result)


@router.get("/{quotation_id}", response_model=QuotationDetail)
async def get_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    return QuotationDetail(**await _decorate(doc))


async def _decorate(doc: dict) -> dict:
    cust = await db.customers.find_one({"customer_id": doc.get("customer_id")}, {"_id": 0, "company": 1, "pic_name": 1, "email": 1, "phone": 1})
    signer = await db.users.find_one({"user_id": doc.get("sales_id")}, {"_id": 0, "name": 1, "role": 1, "signature_image": 1, "signature_title": 1})
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


@router.get("/{quotation_id}/email-draft", response_model=QuotationEmailDraft)
async def quotation_email_draft(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    doc = await _decorate(doc)
    quotation_number = str(doc.get("quotation_number") or quotation_id)
    customer_name = str(doc.get("customer_company") or doc.get("customer_name") or "Customer")
    customer_email = str(doc.get("customer_email") or "")
    subject = f"Quotation {quotation_number} - {customer_name}"
    body = (
        f"Yth. Bapak/Ibu {doc.get('customer_pic_name') or customer_name},\\n\\n"
        f"Berikut kami sampaikan quotation {quotation_number} dari PT. Wellracom Industri Komputindo.\\n\\n"
        "Quotation terlampir dalam email ini.\\n\\n"
        "Mohon dapat diperiksa. Apabila ada pertanyaan atau kebutuhan penyesuaian, "
        "silakan menghubungi kami.\\n\\n"
        "Terima kasih atas perhatian dan kerja samanya.\\n\\n"
        f"Hormat kami,\\n{doc.get('sales_name') or 'Sales'}\\nPT. Wellracom Industri Komputindo"
    )
    return QuotationEmailDraft(to=customer_email, subject=subject, body=body, quotation_number=quotation_number)


@router.post("/{quotation_id}/email-eml")
async def quotation_email_eml(quotation_id: str, payload: QuotationEmailRequest, request: Request, user: dict = Depends(current_user)):
    if not payload.to.strip():
        raise HTTPException(status_code=400, detail="Alamat email tujuan wajib diisi")
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")

    pdf_response = await download_quotation_pdf(quotation_id, request, user)
    chunks = []
    if getattr(pdf_response, "body_iterator", None) is not None:
        async for chunk in pdf_response.body_iterator:
            chunks.append(chunk)
    pdf_bytes = b"".join(chunks)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF quotation gagal dibuat")

    msg = EmailMessage()
    msg["To"] = payload.to.strip()
    if payload.cc and payload.cc.strip():
        msg["Cc"] = payload.cc.strip()
    msg["Subject"] = payload.subject.strip() or f"Quotation {doc.get('quotation_number') or quotation_id}"
    msg["From"] = "PT. Wellracom Industri Komputindo"
    msg.set_content(payload.body or "")
    quotation_number = str(doc.get("quotation_number") or quotation_id)
    safe_quotation_number = quotation_number.replace("/", "_").replace("\\", "_").replace(" ", "_")
    filename = f"Quotation_{safe_quotation_number}.pdf"
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    eml_bytes = msg.as_bytes()
    eml_filename = f"Quotation_{safe_quotation_number}.eml"
    return StreamingResponse(
        BytesIO(eml_bytes),
        media_type="message/rfc822",
        headers={"Content-Disposition": f'attachment; filename="{eml_filename}"'},
    )


@router.get("/{quotation_id}/pdf")
async def download_quotation_pdf(quotation_id: str, request: Request, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    doc = await _decorate(doc)
    buffer = BytesIO()
    quotation_number = str(doc.get("quotation_number") or quotation_id).replace("/", "_").replace("\\", "_").replace(" ", "_")
    customer_company = doc.get("customer_company") or doc.get("customer_name") or "-"
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("QuotationNormal", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, spaceAfter=2)
    small = ParagraphStyle("QuotationSmall", parent=normal, fontSize=7.5, leading=9)
    title = ParagraphStyle("QuotationTitle", parent=normal, fontName="Helvetica-Bold", fontSize=17, leading=20, alignment=TA_RIGHT)
    section = ParagraphStyle("QuotationSection", parent=normal, fontName="Helvetica-Bold", fontSize=9, leading=11)
    right = ParagraphStyle("QuotationRight", parent=normal, alignment=TA_RIGHT)
    center = ParagraphStyle("QuotationCenter", parent=normal, alignment=TA_CENTER)
    item_header = ParagraphStyle("QuotationItemHeader", parent=normal, fontName="Helvetica-Bold", fontSize=7.5, leading=9, alignment=TA_CENTER, textColor=colors.HexColor("#111827"))
    story = []
    company_name = "PT. WELLRACOM INDUSTRI KOMPUTINDO"
    logo_path = "/app/frontend/public/logo well.jpg"
    logo = Image(logo_path, width=19 * mm, height=19 * mm, kind="proportional")
    company_header = [Paragraph(f"<b>{company_name}</b>", ParagraphStyle("CompanyHeader", parent=normal, fontName="Helvetica-Bold", fontSize=11, leading=13, spaceAfter=1)), Paragraph("Industrial Computing • Automation • Communication", small), Spacer(1, 1 * mm), Paragraph("EPIWALK A707 Rasuna Epicentrum Kuningan, Jakarta Selatan", small)]
    header_left = Table([[logo, company_header]], colWidths=[25 * mm, 80 * mm])
    header_left.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    header_right = [Paragraph("QUOTATION", title), Spacer(1, 2 * mm), Paragraph(f"<b>No:</b> {doc.get('quotation_number') or '-'}", right), Paragraph(f"<b>Date:</b> {doc.get('quotation_date') or '-'}", right), Paragraph(f"<b>Valid Until:</b> {doc.get('validity_date') or '-'}", right)]
    header = Table([[header_left, header_right]], colWidths=[105 * mm, 75 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(header); story.append(Spacer(1, 5 * mm))
    customer_data = [[Paragraph("<b>TO:</b>", section), Paragraph(f"<b>{customer_company}</b>", normal)], [Paragraph("<b>Attention:</b>", small), Paragraph(str(doc.get("customer_pic_name") or "-"), normal)], [Paragraph("<b>Email:</b>", small), Paragraph(str(doc.get("customer_email") or "-"), normal)], [Paragraph("<b>Phone:</b>", small), Paragraph(str(doc.get("customer_phone") or "-"), normal)]]
    customer_table = Table(customer_data, colWidths=[28 * mm, 152 * mm])
    customer_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    story.append(customer_table); story.append(Spacer(1, 5 * mm))
    items = doc.get("items") or []
    has_discount = any(float(item.get("discount") or 0) > 0 for item in items)
    item_header_row = [Paragraph("<b>NO</b>", item_header), Paragraph("<b>ITEMS / SPECIFICATION</b>", item_header), Paragraph("<b>UNIT PRICE</b>", item_header), Paragraph("<b>QTY</b>", item_header)]
    if has_discount: item_header_row.append(Paragraph("<b>DISCOUNT</b>", item_header))
    item_header_row.append(Paragraph("<b>AMOUNT</b>", item_header))
    item_rows = [item_header_row]
    def money(value): return f"Rp {float(value or 0):,.0f}".replace(",", ".")
    for idx, item in enumerate(items, start=1):
        description = str(item.get("description") or "-")
        description_html = description.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")
        qty = item.get("qty") or 0; unit = str(item.get("unit") or "Unit"); unit_price = float(item.get("unit_price") or 0); discount = float(item.get("discount") or 0); subtotal = float(item.get("subtotal") or 0)
        row = [Paragraph(str(idx), center), Paragraph(description_html, normal), Paragraph(money(unit_price), right), Paragraph(f"{qty:g} {unit}", center)]
        if has_discount: row.append(Paragraph(money(discount), right))
        row.append(Paragraph(money(subtotal), right)); item_rows.append(row)
    item_col_widths = [9 * mm, 78 * mm, 30 * mm, 18 * mm, 25 * mm, 20 * mm] if has_discount else [9 * mm, 92 * mm, 30 * mm, 18 * mm, 31 * mm]
    item_table = Table(item_rows, colWidths=item_col_widths, repeatRows=1)
    item_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#111827")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story.append(item_table); story.append(Spacer(1, 4 * mm))
    subtotal_value = float(doc.get("subtotal") or 0); discount_value = float(doc.get("discount") or 0); tax_value = float(doc.get("tax") or 0); grand_total = float(doc.get("grand_total") or 0)
    totals_rows = [[Paragraph("SUBTOTAL", right), Paragraph(money(subtotal_value), right)]]
    if discount_value > 0:
        discount_type = str(doc.get("discount_type") or "amount")
        discount_input = float(doc.get("discount_input") or discount_value)
        discount_label = f"DISCOUNT {discount_input:g}%" if discount_type == "percent" else "DISCOUNT"
        totals_rows.append([Paragraph(discount_label, right), Paragraph(money(discount_value), right)])
    totals_rows.extend([[Paragraph(f"PPN {float(doc.get('tax_percent') or 0):g}%", right), Paragraph(money(tax_value), right)], [Paragraph("<b>GRAND TOTAL</b>", right), Paragraph(f"<b>{money(grand_total)}</b>", right)]])
    totals_table = Table(totals_rows, colWidths=[35 * mm, 35 * mm]); totals_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1), ("TOPPADDING", (0, 0), (-1, -1), 1.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#111827")), ("TEXTCOLOR", (0, -1), (-1, -1), colors.white)]))
    totals_wrapper = Table([["", totals_table]], colWidths=[110 * mm, 70 * mm]); totals_wrapper.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])); story.append(totals_wrapper); story.append(Spacer(1, 4 * mm))
    payment_term = doc.get("payment_term") or "-"
    delivery_term = doc.get("delivery_term") or "-"
    validity_date = doc.get("validity_date") or "-"
    terms = [
        Paragraph("<b>TERMS &amp; CONDITIONS</b>", section),
        Paragraph(f"• Payment: {payment_term}", small),
        Paragraph(f"• Pengiriman: {delivery_term}", small),
        Paragraph(f"• Validitas: s/d {validity_date}", small),
    ]
    notes_text = str(doc.get("notes") or "").strip()
    if notes_text:
        note_lines = notes_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for note_line in note_lines:
            note_line = note_line.strip()
            if not note_line:
                continue
            note_line = re.sub(r"^catatan\s*:\s*", "", note_line, flags=re.IGNORECASE)
            note_line = re.sub(r"^[•\-]\s*", "", note_line).strip()
            if note_line:
                note_html = note_line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                terms.append(Paragraph(f"• {note_html}", small))

    signature_name = doc.get("signature_name") or doc.get("sales_name") or "Sales"
    signature_title = doc.get("signature_title") or "Sales"
    signature_data = str(doc.get("signature_image") or "").strip()
    signature_image = None
    if signature_data.startswith("data:image/"):
        try:
            match = re.match(r"^data:image/(png|jpeg|jpg);base64,(.+)$", signature_data, re.IGNORECASE | re.DOTALL)
            if match:
                signature_image = Image(BytesIO(base64.b64decode(match.group(2))), width=55 * mm, height=28 * mm, kind="proportional")
        except Exception:
            signature_image = None

    signature_visual = Table(
        [[signature_image if signature_image is not None else Spacer(1, 18 * mm)]],
        colWidths=[55 * mm],
    )
    signature_visual.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    signature_flow = [
        Paragraph("<b>Hormat Kami,</b>", section),
        Spacer(1, 4 * mm),
        signature_visual,
        Paragraph(f"<b>{signature_name}</b>", normal),
        Paragraph(signature_title, small),
    ]
    signature_table = Table([[terms]], colWidths=[180 * mm])
    signature_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    signature_content = Table([[signature_flow]], colWidths=[180 * mm])
    signature_content.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(signature_table)
    story.append(Spacer(1, 3 * mm))
    story.append(signature_content)
    story.append(Spacer(1, 4 * mm))

    footer = Table([[Paragraph(f"Quotation {doc.get('quotation_number') or '-'}", small), Paragraph("This document is digitally generated.", ParagraphStyle("FooterRight", parent=small, alignment=TA_RIGHT))]], colWidths=[90 * mm, 90 * mm]); footer.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#9CA3AF")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])); story.append(footer)
    def draw_page_number(canvas, doc_obj):
        canvas.saveState(); canvas.setFont("Helvetica", 7); canvas.setFillColor(colors.HexColor("#6B7280")); canvas.drawRightString(A4[0] - 15 * mm, 8 * mm, f"Page {doc_obj.page}"); canvas.restoreState()
    pdf_doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=15 * mm, leftMargin=15 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=f"Quotation {doc.get('quotation_number') or '-'}", author=company_name)
    pdf_doc.build(story, onFirstPage=draw_page_number, onLaterPages=draw_page_number)
    buffer.seek(0)
    filename = f"Quotation_{quotation_number}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("", response_model=QuotationDetail)
async def create_quotation(payload: QuotationIn, user: dict = Depends(current_user)):
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1})
    if not cust: raise HTTPException(status_code=400, detail="Customer tidak ditemukan")
    sales_id = user["user_id"] if user["role"] == SALES else (payload.sales_id or user["user_id"])
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1})
    totals = _compute(payload.items, payload.discount, payload.discount_type, payload.tax_percent); now = datetime.now(timezone.utc); doc = payload.model_dump(); doc["discount_input"] = payload.discount; doc.update(totals); doc.update({"quotation_id": await next_code("QTN"), "quotation_number": await next_quotation_number(sales["name"] if sales else None), "quotation_date": payload.quotation_date or today_iso(), "sales_id": sales_id, "sales_name": sales["name"] if sales else None, "customer_name": cust["customer_name"], "created_date": now, "updated_date": now})
    await db.quotations.insert_one(dict(doc)); await write_audit(user, "CREATE", "Quotation", doc["quotation_number"], None, doc["grand_total"])
    return QuotationDetail(**await _decorate(doc))


@router.put("/{quotation_id}", response_model=QuotationDetail)
async def update_quotation(quotation_id: str, payload: QuotationIn, user: dict = Depends(current_user)):
    scope = await scope_filter(user); existing = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    updates = payload.model_dump(); updates["discount_input"] = payload.discount; updates.update(_compute(payload.items, payload.discount, payload.discount_type, payload.tax_percent))
    if user["role"] == SALES: updates.pop("sales_id", None)
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1}); updates["customer_name"] = cust["customer_name"] if cust else existing.get("customer_name"); updates["updated_date"] = datetime.now(timezone.utc)
    await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": updates}); await write_audit(user, "UPDATE", "Quotation", existing.get("quotation_number", quotation_id), existing.get("grand_total"), updates.get("grand_total"))
    return QuotationDetail(**await _decorate({**existing, **updates}))


@router.patch("/{quotation_id}/status", response_model=QuotationDetail)
async def change_status(quotation_id: str, payload: StatusChange, user: dict = Depends(current_user)):
    if payload.status not in STATUSES: raise HTTPException(status_code=400, detail="Status tidak valid")
    scope = await scope_filter(user); existing = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    updates = {"status": payload.status, "updated_date": datetime.now(timezone.utc)}; await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": updates}); await write_audit(user, "UPDATE", "Quotation", existing.get("quotation_number", quotation_id), f"Status: {existing.get('status')}", f"Status: {payload.status}")
    return QuotationDetail(**await _decorate({**existing, **updates}))


@router.post("/{quotation_id}/duplicate", response_model=QuotationDetail)
async def duplicate_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user); src = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not src: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    now = datetime.now(timezone.utc); doc = {**src, "quotation_id": await next_code("QTN"), "quotation_number": await next_quotation_number(src.get("sales_name")), "status": "Draft", "quotation_date": today_iso(), "created_date": now, "updated_date": now}
    await db.quotations.insert_one(dict(doc)); await write_audit(user, "DUPLICATE", "Quotation", doc["quotation_number"], quotation_id, doc["quotation_id"])
    return QuotationDetail(**await _decorate(doc))


@router.post("/{quotation_id}/convert-to-po", response_model=ConvertResponse)
async def convert_to_po(quotation_id: str, payload: ConvertRequest, user: dict = Depends(current_user)):
    scope = await scope_filter(user); qt = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not qt: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    if qt.get("status") == "Converted": raise HTTPException(status_code=400, detail="Quotation ini sudah dikonversi menjadi PO")
    po_number = (payload.po_number or "").strip()
    if not po_number: raise HTTPException(status_code=400, detail="Nomor PO customer wajib diisi")
    if await db.purchase_orders.find_one({"customer_id": qt["customer_id"], "po_number": po_number}, {"_id": 1}): raise HTTPException(status_code=400, detail=f"Nomor PO '{po_number}' sudah terdaftar untuk customer ini")
    now = datetime.now(timezone.utc)
    po_items = [{"po_item_id": f"POI-{i:03d}", "product_id": it.get("product_id"), "description": it.get("description"), "qty": it.get("qty", 0), "unit": it.get("unit", "Unit"), "unit_price": it.get("unit_price", 0), "subtotal": it.get("subtotal", 0)} for i, it in enumerate(qt.get("items", []), start=1)]
    po = {"po_id": await next_code("POR"), "po_number": po_number, "po_date": payload.po_date or today_iso(), "customer_id": qt["customer_id"], "customer_name": qt.get("customer_name"), "quotation_id": qt["quotation_id"], "quotation_number": qt.get("quotation_number"), "sales_id": qt.get("sales_id"), "sales_name": qt.get("sales_name"), "po_value": qt.get("grand_total", 0), "delivery_address": None, "payment_term": qt.get("payment_term"), "notes": f"PO customer atas quotation {qt.get('quotation_number')}", "status": "Received", "items": po_items, "document_name": None, "created_date": now, "updated_date": now}
    await db.purchase_orders.insert_one(dict(po)); await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": {"status": "Converted", "updated_date": now}}); await write_audit(user, "CONVERT", "Quotation", qt.get("quotation_number", quotation_id), qt.get("status"), f"PO {po['po_number']}")
    return ConvertResponse(po_id=po["po_id"], po_number=po["po_number"])


@router.delete("/{quotation_id}")
async def delete_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user); res = await db.quotations.delete_one({"quotation_id": quotation_id, **scope})
    if res.deleted_count == 0: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    await write_audit(user, "DELETE", "Quotation", quotation_id)
    return {"ok": True}@router.post("/{quotation_id}/email-eml")
async def quotation_email_eml(quotation_id: str, payload: QuotationEmailRequest, request: Request, user: dict = Depends(current_user)):
    if not payload.to.strip():
        raise HTTPException(status_code=400, detail="Alamat email tujuan wajib diisi")
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")

    pdf_response = await download_quotation_pdf(quotation_id, request, user)
    chunks = []
    if getattr(pdf_response, "body_iterator", None) is not None:
        async for chunk in pdf_response.body_iterator:
            chunks.append(chunk)
    pdf_bytes = b"".join(chunks)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF quotation gagal dibuat")

    msg = EmailMessage()
    msg["To"] = payload.to.strip()
    if payload.cc and payload.cc.strip():
        msg["Cc"] = payload.cc.strip()
    msg["Subject"] = payload.subject.strip() or f"Quotation {doc.get('quotation_number') or quotation_id}"
    msg["From"] = "PT. Wellracom Industri Komputindo"
    msg.set_content(payload.body or "")
    quotation_number = str(doc.get("quotation_number") or quotation_id)
    safe_quotation_number = quotation_number.replace("/", "_").replace("\\", "_").replace(" ", "_")
    filename = f"Quotation_{safe_quotation_number}.pdf"
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    eml_bytes = msg.as_bytes()
    eml_filename = f"Quotation_{safe_quotation_number}.eml"
    return StreamingResponse(
        BytesIO(eml_bytes),
        media_type="message/rfc822",
        headers={"Content-Disposition": f'attachment; filename="{eml_filename}"'},
    )


@router.get("/{quotation_id}/pdf")
async def download_quotation_pdf(quotation_id: str, request: Request, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    doc = await _decorate(doc)
    buffer = BytesIO()
    quotation_number = str(doc.get("quotation_number") or quotation_id).replace("/", "_").replace("\\", "_").replace(" ", "_")
    customer_company = doc.get("customer_company") or doc.get("customer_name") or "-"
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("QuotationNormal", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, spaceAfter=2)
    small = ParagraphStyle("QuotationSmall", parent=normal, fontSize=7.5, leading=9)
    title = ParagraphStyle("QuotationTitle", parent=normal, fontName="Helvetica-Bold", fontSize=17, leading=20, alignment=TA_RIGHT)
    section = ParagraphStyle("QuotationSection", parent=normal, fontName="Helvetica-Bold", fontSize=9, leading=11)
    right = ParagraphStyle("QuotationRight", parent=normal, alignment=TA_RIGHT)
    center = ParagraphStyle("QuotationCenter", parent=normal, alignment=TA_CENTER)
    item_header = ParagraphStyle("QuotationItemHeader", parent=normal, fontName="Helvetica-Bold", fontSize=7.5, leading=9, alignment=TA_CENTER, textColor=colors.HexColor("#111827"))
    story = []
    company_name = "PT. WELLRACOM INDUSTRI KOMPUTINDO"
    logo_path = "/app/frontend/public/logo well.jpg"
    logo = Image(logo_path, width=19 * mm, height=19 * mm, kind="proportional")
    company_header = [Paragraph(f"<b>{company_name}</b>", ParagraphStyle("CompanyHeader", parent=normal, fontName="Helvetica-Bold", fontSize=11, leading=13, spaceAfter=1)), Paragraph("Industrial Computing • Automation • Communication", small), Spacer(1, 1 * mm), Paragraph("EPIWALK A707 Rasuna Epicentrum Kuningan, Jakarta Selatan", small)]
    header_left = Table([[logo, company_header]], colWidths=[25 * mm, 80 * mm])
    header_left.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    header_right = [Paragraph("QUOTATION", title), Spacer(1, 2 * mm), Paragraph(f"<b>No:</b> {doc.get('quotation_number') or '-'}", right), Paragraph(f"<b>Date:</b> {doc.get('quotation_date') or '-'}", right), Paragraph(f"<b>Valid Until:</b> {doc.get('validity_date') or '-'}", right)]
    header = Table([[header_left, header_right]], colWidths=[105 * mm, 75 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(header); story.append(Spacer(1, 5 * mm))
    customer_data = [[Paragraph("<b>TO:</b>", section), Paragraph(f"<b>{customer_company}</b>", normal)], [Paragraph("<b>Attention:</b>", small), Paragraph(str(doc.get("customer_pic_name") or "-"), normal)], [Paragraph("<b>Email:</b>", small), Paragraph(str(doc.get("customer_email") or "-"), normal)], [Paragraph("<b>Phone:</b>", small), Paragraph(str(doc.get("customer_phone") or "-"), normal)]]
    customer_table = Table(customer_data, colWidths=[28 * mm, 152 * mm])
    customer_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    story.append(customer_table); story.append(Spacer(1, 5 * mm))
    items = doc.get("items") or []
    has_discount = any(float(item.get("discount") or 0) > 0 for item in items)
    item_header_row = [Paragraph("<b>NO</b>", item_header), Paragraph("<b>ITEMS / SPECIFICATION</b>", item_header), Paragraph("<b>UNIT PRICE</b>", item_header), Paragraph("<b>QTY</b>", item_header)]
    if has_discount: item_header_row.append(Paragraph("<b>DISCOUNT</b>", item_header))
    item_header_row.append(Paragraph("<b>AMOUNT</b>", item_header))
    item_rows = [item_header_row]
    def money(value): return f"Rp {float(value or 0):,.0f}".replace(",", ".")
    for idx, item in enumerate(items, start=1):
        description = str(item.get("description") or "-")
        description_html = description.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")
        qty = item.get("qty") or 0; unit = str(item.get("unit") or "Unit"); unit_price = float(item.get("unit_price") or 0); discount = float(item.get("discount") or 0); subtotal = float(item.get("subtotal") or 0)
        row = [Paragraph(str(idx), center), Paragraph(description_html, normal), Paragraph(money(unit_price), right), Paragraph(f"{qty:g} {unit}", center)]
        if has_discount: row.append(Paragraph(money(discount), right))
        row.append(Paragraph(money(subtotal), right)); item_rows.append(row)
    item_col_widths = [9 * mm, 78 * mm, 30 * mm, 18 * mm, 25 * mm, 20 * mm] if has_discount else [9 * mm, 92 * mm, 30 * mm, 18 * mm, 31 * mm]
    item_table = Table(item_rows, colWidths=item_col_widths, repeatRows=1)
    item_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#111827")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story.append(item_table); story.append(Spacer(1, 4 * mm))
    subtotal_value = float(doc.get("subtotal") or 0); discount_value = float(doc.get("discount") or 0); tax_value = float(doc.get("tax") or 0); grand_total = float(doc.get("grand_total") or 0)
    totals_rows = [[Paragraph("SUBTOTAL", right), Paragraph(money(subtotal_value), right)]]
    if discount_value > 0:
        discount_type = str(doc.get("discount_type") or "amount")
        discount_input = float(doc.get("discount_input") or discount_value)
        discount_label = f"DISCOUNT {discount_input:g}%" if discount_type == "percent" else "DISCOUNT"
        totals_rows.append([Paragraph(discount_label, right), Paragraph(money(discount_value), right)])
    totals_rows.extend([[Paragraph(f"PPN {float(doc.get('tax_percent') or 0):g}%", right), Paragraph(money(tax_value), right)], [Paragraph("<b>GRAND TOTAL</b>", right), Paragraph(f"<b>{money(grand_total)}</b>", right)]])
    totals_table = Table(totals_rows, colWidths=[35 * mm, 35 * mm]); totals_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1), ("TOPPADDING", (0, 0), (-1, -1), 1.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#111827")), ("TEXTCOLOR", (0, -1), (-1, -1), colors.white)]))
    totals_wrapper = Table([["", totals_table]], colWidths=[110 * mm, 70 * mm]); totals_wrapper.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])); story.append(totals_wrapper); story.append(Spacer(1, 4 * mm))
    payment_term = doc.get("payment_term") or "-"
    delivery_term = doc.get("delivery_term") or "-"
    validity_date = doc.get("validity_date") or "-"
    terms = [
        Paragraph("<b>TERMS &amp; CONDITIONS</b>", section),
        Paragraph(f"• Payment: {payment_term}", small),
        Paragraph(f"• Pengiriman: {delivery_term}", small),
        Paragraph(f"• Validitas: s/d {validity_date}", small),
    ]
    notes_text = str(doc.get("notes") or "").strip()
    if notes_text:
        note_lines = notes_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for note_line in note_lines:
            note_line = note_line.strip()
            if not note_line:
                continue
            note_line = re.sub(r"^catatan\s*:\s*", "", note_line, flags=re.IGNORECASE)
            note_line = re.sub(r"^[•\-]\s*", "", note_line).strip()
            if note_line:
                note_html = note_line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                terms.append(Paragraph(f"• {note_html}", small))

    signature_name = doc.get("signature_name") or doc.get("sales_name") or "Sales"
    signature_title = doc.get("signature_title") or "Sales"
    signature_data = str(doc.get("signature_image") or "").strip()
    signature_image = None
    if signature_data.startswith("data:image/"):
        try:
            match = re.match(r"^data:image/(png|jpeg|jpg);base64,(.+)$", signature_data, re.IGNORECASE | re.DOTALL)
            if match:
                signature_image = Image(BytesIO(base64.b64decode(match.group(2))), width=55 * mm, height=28 * mm, kind="proportional")
        except Exception:
            signature_image = None

    signature_visual = Table(
        [[signature_image if signature_image is not None else Spacer(1, 18 * mm)]],
        colWidths=[55 * mm],
    )
    signature_visual.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    signature_flow = [
        Paragraph("<b>Hormat Kami,</b>", section),
        Spacer(1, 4 * mm),
        signature_visual,
        Paragraph(f"<b>{signature_name}</b>", normal),
        Paragraph(signature_title, small),
    ]
    signature_table = Table([[terms]], colWidths=[180 * mm])
    signature_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    signature_content = Table([[signature_flow]], colWidths=[180 * mm])
    signature_content.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(signature_table)
    story.append(Spacer(1, 3 * mm))
    story.append(signature_content)
    story.append(Spacer(1, 4 * mm))

    footer = Table([[Paragraph(f"Quotation {doc.get('quotation_number') or '-'}", small), Paragraph("This document is digitally generated.", ParagraphStyle("FooterRight", parent=small, alignment=TA_RIGHT))]], colWidths=[90 * mm, 90 * mm]); footer.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#9CA3AF")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])); story.append(footer)
    def draw_page_number(canvas, doc_obj):
        canvas.saveState(); canvas.setFont("Helvetica", 7); canvas.setFillColor(colors.HexColor("#6B7280")); canvas.drawRightString(A4[0] - 15 * mm, 8 * mm, f"Page {doc_obj.page}"); canvas.restoreState()
    pdf_doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=15 * mm, leftMargin=15 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=f"Quotation {doc.get('quotation_number') or '-'}", author=company_name)
    pdf_doc.build(story, onFirstPage=draw_page_number, onLaterPages=draw_page_number)
    buffer.seek(0)
    filename = f"Quotation_{quotation_number}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("", response_model=QuotationDetail)
async def create_quotation(payload: QuotationIn, user: dict = Depends(current_user)):
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1})
    if not cust: raise HTTPException(status_code=400, detail="Customer tidak ditemukan")
    sales_id = user["user_id"] if user["role"] == SALES else (payload.sales_id or user["user_id"])
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1})
    totals = _compute(payload.items, payload.discount, payload.discount_type, payload.tax_percent); now = datetime.now(timezone.utc); doc = payload.model_dump(); doc["discount_input"] = payload.discount; doc.update(totals); doc.update({"quotation_id": await next_code("QTN"), "quotation_number": await next_quotation_number(sales["name"] if sales else None), "quotation_date": payload.quotation_date or today_iso(), "sales_id": sales_id, "sales_name": sales["name"] if sales else None, "customer_name": cust["customer_name"], "created_date": now, "updated_date": now})
    await db.quotations.insert_one(dict(doc)); await write_audit(user, "CREATE", "Quotation", doc["quotation_number"], None, doc["grand_total"])
    return QuotationDetail(**await _decorate(doc))


@router.put("/{quotation_id}", response_model=QuotationDetail)
async def update_quotation(quotation_id: str, payload: QuotationIn, user: dict = Depends(current_user)):
    scope = await scope_filter(user); existing = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    updates = payload.model_dump(); updates["discount_input"] = payload.discount; updates.update(_compute(payload.items, payload.discount, payload.discount_type, payload.tax_percent))
    if user["role"] == SALES: updates.pop("sales_id", None)
    cust = await db.customers.find_one({"customer_id": payload.customer_id}, {"_id": 0, "customer_name": 1}); updates["customer_name"] = cust["customer_name"] if cust else existing.get("customer_name"); updates["updated_date"] = datetime.now(timezone.utc)
    await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": updates}); await write_audit(user, "UPDATE", "Quotation", existing.get("quotation_number", quotation_id), existing.get("grand_total"), updates.get("grand_total"))
    return QuotationDetail(**await _decorate({**existing, **updates}))


@router.patch("/{quotation_id}/status", response_model=QuotationDetail)
async def change_status(quotation_id: str, payload: StatusChange, user: dict = Depends(current_user)):
    if payload.status not in STATUSES: raise HTTPException(status_code=400, detail="Status tidak valid")
    scope = await scope_filter(user); existing = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    updates = {"status": payload.status, "updated_date": datetime.now(timezone.utc)}; await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": updates}); await write_audit(user, "UPDATE", "Quotation", existing.get("quotation_number", quotation_id), f"Status: {existing.get('status')}", f"Status: {payload.status}")
    return QuotationDetail(**await _decorate({**existing, **updates}))


@router.post("/{quotation_id}/duplicate", response_model=QuotationDetail)
async def duplicate_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user); src = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not src: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    now = datetime.now(timezone.utc); doc = {**src, "quotation_id": await next_code("QTN"), "quotation_number": await next_quotation_number(src.get("sales_name")), "status": "Draft", "quotation_date": today_iso(), "created_date": now, "updated_date": now}
    await db.quotations.insert_one(dict(doc)); await write_audit(user, "DUPLICATE", "Quotation", doc["quotation_number"], quotation_id, doc["quotation_id"])
    return QuotationDetail(**await _decorate(doc))


@router.post("/{quotation_id}/convert-to-po", response_model=ConvertResponse)
async def convert_to_po(quotation_id: str, payload: ConvertRequest, user: dict = Depends(current_user)):
    scope = await scope_filter(user); qt = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not qt: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    if qt.get("status") == "Converted": raise HTTPException(status_code=400, detail="Quotation ini sudah dikonversi menjadi PO")
    po_number = (payload.po_number or "").strip()
    if not po_number: raise HTTPException(status_code=400, detail="Nomor PO customer wajib diisi")
    if await db.purchase_orders.find_one({"customer_id": qt["customer_id"], "po_number": po_number}, {"_id": 1}): raise HTTPException(status_code=400, detail=f"Nomor PO '{po_number}' sudah terdaftar untuk customer ini")
    now = datetime.now(timezone.utc)
    po_items = [{"po_item_id": f"POI-{i:03d}", "product_id": it.get("product_id"), "description": it.get("description"), "qty": it.get("qty", 0), "unit": it.get("unit", "Unit"), "unit_price": it.get("unit_price", 0), "subtotal": it.get("subtotal", 0)} for i, it in enumerate(qt.get("items", []), start=1)]
    po = {"po_id": await next_code("POR"), "po_number": po_number, "po_date": payload.po_date or today_iso(), "customer_id": qt["customer_id"], "customer_name": qt.get("customer_name"), "quotation_id": qt["quotation_id"], "quotation_number": qt.get("quotation_number"), "sales_id": qt.get("sales_id"), "sales_name": qt.get("sales_name"), "po_value": qt.get("grand_total", 0), "delivery_address": None, "payment_term": qt.get("payment_term"), "notes": f"PO customer atas quotation {qt.get('quotation_number')}", "status": "Received", "items": po_items, "document_name": None, "created_date": now, "updated_date": now}
    await db.purchase_orders.insert_one(dict(po)); await db.quotations.update_one({"quotation_id": quotation_id}, {"$set": {"status": "Converted", "updated_date": now}}); await write_audit(user, "CONVERT", "Quotation", qt.get("quotation_number", quotation_id), qt.get("status"), f"PO {po['po_number']}")
    return ConvertResponse(po_id=po["po_id"], po_number=po["po_number"])


@router.delete("/{quotation_id}")
async def delete_quotation(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user); res = await db.quotations.delete_one({"quotation_id": quotation_id, **scope})
    if res.deleted_count == 0: raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    await write_audit(user, "DELETE", "Quotation", quotation_id)
    return {"ok": True}
