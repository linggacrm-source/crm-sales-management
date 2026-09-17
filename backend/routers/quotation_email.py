from email.message import EmailMessage
from io import BytesIO
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from lib.auth import current_user, scope_filter
from lib.db import db
from routers.quotation_pdf import download_quotation_pdf_clean

router = APIRouter(prefix="/quotations", tags=["quotation-email"])


class EmailDraft(BaseModel):
    to: Optional[str] = None
    cc: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


def _safe_filename(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in value)


def _default_subject(doc: dict) -> str:
    return f"Quotation {doc.get('quotation_number') or doc.get('quotation_id') or ''} - {doc.get('customer_company') or doc.get('customer_name') or ''}".strip(" -")


def _default_body(doc: dict) -> str:
    pic = doc.get("customer_pic_name") or "Bapak/Ibu"
    number = doc.get("quotation_number") or doc.get("quotation_id") or "-"
    company = doc.get("customer_company") or doc.get("customer_name") or "Bapak/Ibu"
    return (
        f"Dear {pic},\n\n"
        f"Terima kasih atas kesempatan yang diberikan kepada kami.\n\n"
        f"Bersama email ini kami kirimkan quotation {number} untuk kebutuhan {company}. "
        "Mohon dapat direview. Apabila ada spesifikasi, harga, atau informasi lain yang perlu kami sesuaikan, "
        "kami dengan senang hati akan membantu.\n\n"
        "Terima kasih atas perhatian dan kerja samanya.\n\n"
        "Best regards,\n"
        f"{doc.get('signature_name') or doc.get('sales_name') or 'Sales'}\n"
        f"{doc.get('signature_title') or 'Sales'}\n"
        "PT. WELLRACOM INDUSTRI KOMPUTINDO"
    )


@router.get("/{quotation_id}/email-draft")
async def quotation_email_draft(quotation_id: str, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    customer = await db.customers.find_one({"customer_id": doc.get("customer_id")}, {"_id": 0, "company": 1, "pic_name": 1, "email": 1}) or {}
    signer = await db.users.find_one({"user_id": doc.get("sales_id")}, {"_id": 0, "name": 1, "role": 1, "signature_title": 1}) or {}
    doc["customer_company"] = customer.get("company") or doc.get("customer_name")
    doc["customer_pic_name"] = customer.get("pic_name")
    doc["customer_email"] = customer.get("email")
    doc["signature_name"] = signer.get("name")
    doc["sales_name"] = signer.get("name") or doc.get("sales_name")
    doc["signature_title"] = signer.get("signature_title") or signer.get("role")
    return {
        "to": doc.get("customer_email") or "",
        "subject": _default_subject(doc),
        "body": _default_body(doc),
        "quotation_number": doc.get("quotation_number") or quotation_id,
    }


@router.get("/{quotation_id}/email-mailto")
async def quotation_email_mailto(quotation_id: str, user: dict = Depends(current_user)):
    draft = await quotation_email_draft(quotation_id, user)
    if not draft["to"]:
        raise HTTPException(status_code=400, detail="Email customer belum tersedia")
    query = f"subject={quote(draft['subject'])}&body={quote(draft['body'])}"
    return {"mailto": f"mailto:{quote(draft['to'])}?{query}", "to": draft["to"], "subject": draft["subject"], "body": draft["body"]}


@router.post("/{quotation_id}/email-eml")
async def quotation_email_eml(quotation_id: str, payload: EmailDraft, request: Request, user: dict = Depends(current_user)):
    scope = await scope_filter(user)
    doc = await db.quotations.find_one({"quotation_id": quotation_id, **scope}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    customer = await db.customers.find_one({"customer_id": doc.get("customer_id")}, {"_id": 0, "company": 1, "pic_name": 1, "email": 1}) or {}
    signer = await db.users.find_one({"user_id": doc.get("sales_id")}, {"_id": 0, "name": 1, "role": 1, "signature_title": 1}) or {}
    doc["customer_company"] = customer.get("company") or doc.get("customer_name")
    doc["customer_pic_name"] = customer.get("pic_name")
    doc["customer_email"] = customer.get("email")
    doc["signature_name"] = signer.get("name")
    doc["sales_name"] = signer.get("name") or doc.get("sales_name")
    doc["signature_title"] = signer.get("signature_title") or signer.get("role")

    to = (payload.to or doc.get("customer_email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Email customer belum tersedia")
    subject = (payload.subject or _default_subject(doc)).strip()
    body = payload.body or _default_body(doc)

    pdf_response = await download_quotation_pdf_clean(quotation_id, request, user)
    chunks = []
    async for chunk in pdf_response.body_iterator:
        chunks.append(chunk)
    pdf_bytes = b"".join(chunks)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF quotation kosong")

    quotation_number = str(doc.get("quotation_number") or quotation_id)
    filename = f"Quotation_{_safe_filename(quotation_number)}.pdf"
    msg = EmailMessage()
    msg["To"] = to
    if payload.cc:
        msg["Cc"] = payload.cc.strip()
    msg["Subject"] = subject
    msg.set_content(body)
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    eml_name = f"Quotation_{_safe_filename(quotation_number)}.eml"
    return Response(
        content=msg.as_bytes(),
        media_type="message/rfc822",
        headers={"Content-Disposition": f'attachment; filename="{eml_name}"'},
    )
