"""
Payments Router (MongoDB)
Payment entry form is submitted by EMPLOYEE ONLY.
Creates a payment record and marks invoice as Paid.
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, date as date_type
import uuid

from bson import ObjectId  # type: ignore[import]

from app.auth.middleware import CurrentUser, require_role
from app.database import get_db
from app.models.schemas import PaymentCreate
from app.models.schemas import SheetStatus
from app.services.notifications import notify_invoice_paid, schedule_notification


router = APIRouter(prefix="/api/payments", tags=["Payments"])


def _invoice_id_query(invoice_id: str) -> dict:
  clauses = [{"_id": invoice_id}]
  try:
      clauses.append({"_id": ObjectId(invoice_id)})
  except Exception:
      pass
  return {"$or": clauses}


@router.post("")
async def create_payment(
    payment: PaymentCreate,
    user: CurrentUser = Depends(require_role("employee")),
):
    db = get_db()

    inv = await db["invoices"].find_one(_invoice_id_query(payment.invoice_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice_department = (inv.get("department") or "accounts").lower()
    # Non-Accounts employees can only record payments for their own department's invoices
    if user.department != "accounts" and invoice_department != user.department:
        raise HTTPException(status_code=403, detail="Access denied for this invoice")

    if inv.get("sheet_status") != SheetStatus.APPROVED_FOR_RELEASE.value:
        raise HTTPException(status_code=400, detail="Invoice must be Approved for Release")

    # Create payment record
    payment_id = str(uuid.uuid4())
    payment_date = payment.payment_date or date_type.today()
    doc = {
        "_id": payment_id,
        "invoice_id": payment.invoice_id,
        "amount_paid": payment.amount_paid,
        "payment_method": payment.payment_method,
        "reference_number": payment.reference_number,
        "payment_date": str(payment_date),
        "notes": payment.notes,
        "marked_by": user.user_db_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db["payments"].insert_one(doc)

    # Mark invoice as paid
    await db["invoices"].update_one(
        {"_id": payment.invoice_id},
        {
            "$set": {
                "sheet_status": SheetStatus.PAID.value,
                "payment_status": "paid",
                "paid_at": datetime.now(timezone.utc).isoformat(),
                "paid_by": user.user_db_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    updated_inv = {**inv, "sheet_status": SheetStatus.PAID.value, "payment_status": "paid", "paid_by": user.user_db_id}
    schedule_notification(notify_invoice_paid(updated_inv))

    return {"message": "Payment recorded and invoice marked as paid", "payment_id": payment_id}


@router.get("/{invoice_id}")
async def get_payments_for_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    db = get_db()
    inv = await db["invoices"].find_one(_invoice_id_query(invoice_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice_department = (inv.get("department") or "accounts").lower()
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        if invoice_department != user.department:
            raise HTTPException(status_code=403, detail="Access denied for this invoice")

    cursor = db["payments"].find({"invoice_id": invoice_id}).sort("created_at", -1)
    items = await cursor.to_list(length=200)
    for p in items:
        p["id"] = str(p.pop("_id"))
    return {"data": items}

