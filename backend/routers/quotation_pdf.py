from io import BytesIO
import base64
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from lib.auth import current_user, scope_filter
from lib.db import db
from routers.quotations import _decorate

router = APIRouter(prefix="/quotations", tags=["quotation-pdf"])

def format_date(value):
    if not value:
        return "-"
    text = str(value)[:10]
    try:
        year, month, day = text.split("-")
        return f"{day}-{month}-{year}"
    except ValueError:
        return str(value)

@router.get("/{quotation_id}/pdf")
async def download_quotation_pdf_clean(quotation_id: str, request: Request, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    doc = await _decorate(doc)
    buffer = BytesIO()
    quotation_number = str(doc.get("quotation_number") or quotation_id).replace("/", "_").replace("\\", "_").replace(" ", "_")
    customer_company = doc.get("customer_company") or doc.get("customer_name") or "-"
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("QuotationNormalClean", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, spaceAfter=2)
    small = ParagraphStyle("QuotationSmallClean", parent=normal, fontSize=7.5, leading=9)
    title = ParagraphStyle("QuotationTitleClean", parent=normal, fontName="Helvetica-Bold", fontSize=17, leading=20, alignment=TA_RIGHT)
    section = ParagraphStyle("QuotationSectionClean", parent=normal, fontName="Helvetica-Bold", fontSize=9, leading=11)
    right = ParagraphStyle("QuotationRightClean", parent=normal, alignment=TA_RIGHT)
    center = ParagraphStyle("QuotationCenterClean", parent=normal, alignment=TA_CENTER)
    white_right = ParagraphStyle("QuotationWhiteRightClean", parent=right, textColor=colors.white)
    item_header = ParagraphStyle("QuotationItemHeaderClean", parent=normal, fontName="Helvetica-Bold", fontSize=7.5, leading=9, alignment=TA_CENTER, textColor=colors.HexColor("#111827"))
    story = []

    company_name = "PT. WELLRACOM INDUSTRI KOMPUTINDO"
    logo = Image("/app/frontend/public/logo well.jpg", width=19 * mm, height=19 * mm, kind="proportional")
    company_header = [
        Paragraph(f"<b>{company_name}</b>", ParagraphStyle("CompanyHeaderClean", parent=normal, fontName="Helvetica-Bold", fontSize=11, leading=13, spaceAfter=1)),
        Paragraph("Industrial Computing • Automation • Communication", small),
        Spacer(1, 1 * mm),
        Paragraph("EPIWALK A707 Rasuna Epicentrum Kuningan, Jakarta Selatan", small),
    ]
    header_left = Table([[logo, company_header]], colWidths=[25 * mm, 80 * mm])
    header_left.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    header_right = [
        Paragraph("QUOTATION", title), Spacer(1, 2 * mm),
        Paragraph(f"<b>No:</b> {doc.get('quotation_number') or '-'}", right),
        Paragraph(f"<b>Date:</b> {format_date(doc.get('quotation_date'))}", right),
        Paragraph(f"<b>Valid Until:</b> {format_date(doc.get('validity_date'))}", right),
    ]
    header = Table([[header_left, header_right]], colWidths=[105 * mm, 75 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story += [header, Spacer(1, 5 * mm)]

    customer_data = [
        [Paragraph("<b>TO:</b>", section), Paragraph(f"<b>{customer_company}</b>", normal)],
        [Paragraph("<b>Attention:</b>", small), Paragraph(str(doc.get("customer_pic_name") or "-"), normal)],
        [Paragraph("<b>Email:</b>", small), Paragraph(str(doc.get("customer_email") or "-"), normal)],
        [Paragraph("<b>Phone:</b>", small), Paragraph(str(doc.get("customer_phone") or "-"), normal)],
    ]
    customer_table = Table(customer_data, colWidths=[28 * mm, 152 * mm])
    customer_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    story += [customer_table, Spacer(1, 5 * mm)]

    items = doc.get("items") or []
    has_discount = any(float(item.get("discount") or 0) > 0 for item in items)
    item_header_row = [Paragraph("<b>NO</b>", item_header), Paragraph("<b>ITEMS / SPECIFICATION</b>", item_header), Paragraph("<b>UNIT PRICE</b>", item_header), Paragraph("<b>QTY</b>", item_header)]
    if has_discount:
        item_header_row.append(Paragraph("<b>DISCOUNT</b>", item_header))
    item_header_row.append(Paragraph("<b>AMOUNT</b>", item_header))
    item_rows = [item_header_row]

    def money(value):
        return f"Rp {float(value or 0):,.0f}".replace(",", ".")

    for idx, item in enumerate(items, start=1):
        description = str(item.get("description") or "-")
        description_html = description.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")
        qty = item.get("qty") or 0
        unit = str(item.get("unit") or "Unit")
        unit_price = float(item.get("unit_price") or 0)
        discount = float(item.get("discount") or 0)
        subtotal = float(item.get("subtotal") or 0)
        row = [Paragraph(str(idx), center), Paragraph(description_html, normal), Paragraph(money(unit_price), right), Paragraph(f"{qty:g} {unit}", center)]
        if has_discount:
            row.append(Paragraph(money(discount), right))
        row.append(Paragraph(money(subtotal), right))
        item_rows.append(row)

    item_col_widths = [9 * mm, 78 * mm, 30 * mm, 18 * mm, 25 * mm, 20 * mm] if has_discount else [9 * mm, 92 * mm, 30 * mm, 18 * mm, 31 * mm]
    item_table = Table(item_rows, colWidths=item_col_widths, repeatRows=1)
    item_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#111827")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story += [item_table, Spacer(1, 4 * mm)]

    subtotal_value = float(doc.get("subtotal") or 0)
    discount_value = float(doc.get("discount") or 0)
    tax_value = float(doc.get("tax") or 0)
    grand_total = float(doc.get("grand_total") or 0)
    totals_rows = [[Paragraph("SUBTOTAL", right), Paragraph(money(subtotal_value), right)]]
    if discount_value > 0:
        totals_rows.append([Paragraph("DISCOUNT", right), Paragraph(money(discount_value), right)])
    totals_rows.extend([
        [Paragraph(f"PPN {float(doc.get('tax_percent') or 0):g}%", right), Paragraph(money(tax_value), right)],
        [Paragraph("<b>GRAND TOTAL</b>", white_right), Paragraph(f"<b>{money(grand_total)}</b>", white_right)],
    ])
    totals_table = Table(totals_rows, colWidths=[35 * mm, 35 * mm])
    totals_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1), ("TOPPADDING", (0, 0), (-1, -1), 1.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#111827")), ("TEXTCOLOR", (0, -1), (-1, -1), colors.white)]))
    totals_wrapper = Table([["", totals_table]], colWidths=[110 * mm, 70 * mm])
    totals_wrapper.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story += [totals_wrapper, Spacer(1, 4 * mm)]

    signature_name = doc.get("signature_name") or doc.get("sales_name") or "Sales"
    signature_title = doc.get("signature_title") or "Sales"
    signature_data = str(doc.get("signature_image") or "").strip()
    signature_image = None
    if signature_data.startswith("data:image/"):
        try:
            match = re.match(r"^data:image/(png|jpeg|jpg);base64,(.+)$", signature_data, re.IGNORECASE | re.DOTALL)
            if match:
                signature_image = Image(BytesIO(base64.b64decode(match.group(2))), width=35 * mm, height=18 * mm, kind="proportional")
        except Exception:
            signature_image = None

    terms = [Paragraph("<b>TERMS &amp; CONDITIONS</b>", section), Paragraph(f"• Payment: {payment_term}", small), Paragraph(f"• Pengiriman: {delivery_term}", small), Paragraph(f"• Validitas: s/d {format_date(validity_date)}", small)]
    notes_text = str(doc.get("notes") or "").strip()
    if notes_text:
        notes_html = notes_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")
        terms.append(Paragraph(f"• Catatan: {notes_html}", small))

    signature_flow = [
        Paragraph("<b>Hormat Kami,</b>", section),
        signature_image if signature_image is not None else Spacer(1, 18 * mm),
        Paragraph(f"<b>{signature_name}</b>", normal),
        Paragraph(signature_title, small),
    ]
    signature_table = Table([[terms], [signature_flow]], colWidths=[100 * mm])
    signature_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story += [signature_table, Spacer(1, 4 * mm)]
    def draw_page_footer(canvas, doc_obj):
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.rect(0, 0, A4[0], 18 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor("#111111"))
        canvas.setFont("Helvetica-Bold", 8.8)
        canvas.drawString(15 * mm, 13.5 * mm, "Surabaya Office :")
        canvas.drawString(105 * mm, 13.5 * mm, "Jakarta Office :")
        canvas.setFont("Helvetica", 7.4)
        canvas.drawString(15 * mm, 9.3 * mm, "Jl Bratang Binangun No. 83, Surabaya - Jawa Timur")
        canvas.drawString(105 * mm, 9.3 * mm, "Epicentrum - Walk A - 707, HR Rasuna Said, East Jakarta 12960 - Indonesia")
        canvas.setFont("Helvetica", 7.2)
        canvas.drawString(15 * mm, 5.1 * mm, "Ph.   (+62 - 31) 502 8999,  Fax. (+62 - 31) 503 3999")
        canvas.drawString(105 * mm, 5.1 * mm, "Ph.   (+62 21) 2994 1841,  Fax. (+62 21) 2994 1842")
        canvas.setFont("Helvetica", 5.8)
        canvas.setFillColor(colors.HexColor("#555555"))
        canvas.drawRightString(A4[0] - 15 * mm, 1.7 * mm, f"Page {doc_obj.page}")
        canvas.restoreState()

    pdf_doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=15 * mm, leftMargin=15 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=f"Quotation {doc.get('quotation_number') or '-'}", author=company_name)
    pdf_doc.build(story, onFirstPage=draw_page_footer, onLaterPages=draw_page_footer)
    buffer.seek(0)
    filename = f"Quotation_{quotation_number}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
