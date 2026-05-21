"""
Payments Router — Mark invoice as paid
ONLY superadmin can mark invoices as paid.
"""

from fastapi import APIRouter, Depends, HTTPException
from app.auth.middleware import CurrentUser, require_role
from app.database import get_supabase_admin_client
from app.models.schemas import PaymentCreate, PaymentResponse
from datetime import date


router = APIRouter(prefix="/api/payments", tags=["Payments"])


@router.post("", response_model=PaymentResponse)
async def create_payment(
    payment: PaymentCreate,
    user: CurrentUser = Depends(require_role("superadmin")),
):
    """
    Mark an invoice as paid. SUPERADMIN ONLY.
    Creates a payment record and updates the invoice payment_status.
    """
    supabase = get_supabase_admin_client()

    # Verify invoice exists
    invoice = (
        supabase.table("invoices")
        .select("id, total_amount, payment_status")
        .eq("id", payment.invoice_id)
        .single()
        .execute()
    )
    if not invoice.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.data.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Invoice is already marked as paid")

    # Create payment record
    payment_data = payment.model_dump()
    payment_data["marked_by"] = user.user_db_id
    if not payment_data.get("payment_date"):
        payment_data["payment_date"] = str(date.today())

    result = supabase.table("payments").insert(payment_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create payment record")

    # Calculate total paid for this invoice
    all_payments = (
        supabase.table("payments")
        .select("amount_paid")
        .eq("invoice_id", payment.invoice_id)
        .execute()
    )
    total_paid = sum(p["amount_paid"] for p in (all_payments.data or []))
    total_amount = invoice.data.get("total_amount", 0) or 0

    # Update invoice payment_status
    new_status = "paid" if total_paid >= total_amount else "partially_paid"
    supabase.table("invoices").update(
        {"payment_status": new_status, "status": "paid" if new_status == "paid" else "pending"}
    ).eq("id", payment.invoice_id).execute()

    # Audit log
    supabase.table("audit_logs").insert(
        {
            "entity_type": "invoice",
            "entity_id": payment.invoice_id,
            "action": f"marked_as_{new_status}",
            "new_value": str(payment_data),
            "performed_by": user.user_db_id,
        }
    ).execute()

    return PaymentResponse(**result.data[0])


@router.get("/{invoice_id}")
async def get_payments_for_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Get all payments for an invoice."""
    supabase = get_supabase_admin_client()
    result = (
        supabase.table("payments")
        .select("*")
        .eq("invoice_id", invoice_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": result.data or []}
