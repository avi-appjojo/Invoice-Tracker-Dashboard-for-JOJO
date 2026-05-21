"""
Upload Router — PDF invoice upload + auto-extraction
All roles (superadmin, admin, employee) can upload.
"""

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from app.auth.middleware import get_current_user, CurrentUser
from app.database import get_supabase_admin_client
from app.services.pdf_parser import extract_invoice_data
from app.services.invoice_logic import derive_invoice_status, calculate_priority
from app.models.schemas import UploadResponse, AnalyzeResponse, ExtractedInvoiceData
from app.config import get_settings
import uuid
import json


router = APIRouter(prefix="/api/upload", tags=["Upload"])


def _validate_pdf(file: UploadFile, file_bytes: bytes, settings) -> None:
    if file.content_type not in settings.ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Only PDF files are allowed. Got: {file.content_type}",
        )
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_invoice(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Analyze an invoice PDF and return extracted data only. Does NOT store in DB or storage.
    User can review and then call POST /invoice with the same file + extracted_data to save.
    """
    settings = get_settings()
    file_bytes = await file.read()
    _validate_pdf(file, file_bytes, settings)
    try:
        extracted = extract_invoice_data(file_bytes)
        return AnalyzeResponse(extracted_data=extracted)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}\n{traceback.format_exc()}")


@router.post("/invoice", response_model=UploadResponse)
async def upload_invoice(
    file: UploadFile = File(...),
    extracted_data_json: str | None = Form(None, alias="extracted_data"),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Store an invoice PDF and create DB record. If extracted_data is provided (from analyze step),
    use it; otherwise extract from the PDF. Call POST /analyze first to let user review before saving.
    """
    settings = get_settings()
    file_bytes = await file.read()
    _validate_pdf(file, file_bytes, settings)

    try:
        if extracted_data_json:
            data = json.loads(extracted_data_json)
            extracted = ExtractedInvoiceData(**data)
        else:
            extracted = extract_invoice_data(file_bytes)

        # Upload PDF to Supabase Storage
        supabase = get_supabase_admin_client()
        file_name = f"invoices/{uuid.uuid4()}/{file.filename}"

        bucket_name = settings.STORAGE_BUCKET_INVOICES
        try:
            storage_result = supabase.storage.from_(bucket_name).upload(
                file_name,
                file_bytes,
                file_options={"content-type": "application/pdf"},
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload file to storage. Ensure the bucket '{bucket_name}' exists in Supabase Storage. Error: {str(e)}",
            )

        # Get public URL (bucket must be public for View PDF to work in browser)
        pdf_url = supabase.storage.from_(bucket_name).get_public_url(file_name)

        # Derive status and priority
        status = derive_invoice_status(extracted.due_date, "unpaid")
        priority = calculate_priority(extracted.due_date, None, "unpaid")

        # Create invoice record in database
        invoice_data = {
            "invoice_number": extracted.invoice_number,
            "vendor_name": extracted.vendor_name,
            "invoice_date": extracted.invoice_date,
            "due_date": extracted.due_date,
            "amount": extracted.amount,
            "tax_amount": extracted.tax_amount,
            "total_amount": extracted.total_amount,
            "currency": extracted.currency,
            "payment_terms": extracted.payment_terms,
            "description": extracted.description,
            "pdf_url": pdf_url,
            "status": status,
            "payment_status": "unpaid",
            "priority": priority,
            "extracted_data": {
                "raw_text": extracted.raw_text,
                "invoice_number": extracted.invoice_number,
                "vendor_name": extracted.vendor_name,
            },
            "created_by": user.user_db_id,
        }

        result = supabase.table("invoices").insert(invoice_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create invoice record")

        invoice_id = result.data[0]["id"]

        # Create attachment record
        supabase.table("invoice_attachments").insert(
            {
                "invoice_id": invoice_id,
                "file_name": file.filename,
                "file_url": pdf_url,
                "file_type": "application/pdf",
                "uploaded_by": user.user_db_id,
            }
        ).execute()

        # Create audit log
        supabase.table("audit_logs").insert(
            {
                "entity_type": "invoice",
                "entity_id": invoice_id,
                "action": "created_via_pdf_upload",
                "new_value": str(invoice_data),
                "performed_by": user.user_db_id,
            }
        ).execute()

        return UploadResponse(
            message="Invoice uploaded and data extracted successfully",
            invoice_id=str(invoice_id),
            extracted_data=extracted,
            pdf_url=pdf_url,
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}\n\n{error_trace}")
