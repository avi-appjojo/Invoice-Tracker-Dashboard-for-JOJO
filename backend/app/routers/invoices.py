"""
Invoices Router — CRUD operations for invoices
- GET: superadmin, admin
- PUT/DELETE: superadmin only
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import Optional
from datetime import date, datetime, timezone
import uuid
from pydantic import BaseModel
from collections.abc import Mapping

from bson import ObjectId  # type: ignore[import]

from app.auth.middleware import CurrentUser, require_role
from app.database import get_db
from app.models.schemas import InvoiceCreate, InvoiceUpdate, InvoiceListResponse, InvoiceResponse, SheetStatus, AccountsReviewUpdate, AccountsRejectBody
from app.services.invoice_logic import derive_invoice_status, calculate_priority
from app.services.notifications import (
    notify_invoice_created,
    notify_invoice_approved,
    notify_invoice_paid,
    notify_invoice_on_hold_by_admin,
    notify_invoice_on_hold_by_accounts,
    schedule_notification,
)


router = APIRouter(prefix="/api/invoices", tags=["Invoices"])


def _normalize_for_mongo(value):
    """
    Convert values that Mongo/BSON can't encode (e.g. datetime.date) into
    JSON/BSON-friendly types. We store dates as ISO strings across the app.
    """
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {k: _normalize_for_mongo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_for_mongo(v) for v in value]
    return value


def _normalize_currency(value) -> str:
    """Return 'USD' or 'INR' from document currency (handles None, str, different casing)."""
    if value is None:
        return "INR"
    s = str(value).strip().upper()
    return "USD" if s == "USD" else "INR"


def _invoice_id_query(invoice_id: str, include_deleted: bool = False) -> dict:
    """
    Build a Mongo query that matches invoices by string _id or ObjectId(_id).
    Optionally excludes soft-deleted invoices.
    """
    id_clauses = [{"_id": invoice_id}]
    try:
        id_clauses.append({"_id": ObjectId(invoice_id)})
    except Exception:
        # Not a valid ObjectId; ignore
        pass

    base = {"$or": id_clauses}
    if include_deleted:
        return base

    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ]
    }
    return {"$and": [base, not_deleted]}


def _is_uuid_like(value: str) -> bool:
    """True if value looks like a UUID (8-4-4-4-12 hex)."""
    if not value or len(value) != 36:
        return False
    parts = value.split("-")
    return len(parts) == 5 and all(len(p) in (8, 4, 4, 4, 12) and all(c in "0123456789abcdefABCDEF" for c in p) for p in parts)


def _payment_status_from_sheet_status(sheet_status: str | None) -> str:
    return "paid" if sheet_status == SheetStatus.PAID.value else "unpaid"


@router.get("", response_model=InvoiceListResponse)
async def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    priority: Optional[str] = Query(None, description="Single value or comma-separated, e.g. high,critical"),
    sheet_status: Optional[str] = None,
    company_name: Optional[str] = None,
    vendor: Optional[str] = None,
    sort_by: str = Query("created_at", regex="^(created_at|due_date|total_amount|status)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    awaiting_accounts_review: Optional[bool] = Query(False, description="If true (and caller is Accounts or Admin), return only invoices awaiting accounts review"),
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """List invoices from MongoDB (Sheets-style fields supported)."""
    db = get_db()

    # Parse comma-separated priority (e.g. high,critical)
    allowed_priorities = {"low", "medium", "high", "critical"}
    priority_set: set[str] = set()
    if priority:
        for p in priority.replace(" ", "").split(","):
            if p.strip().lower() in allowed_priorities:
                priority_set.add(p.strip().lower())

    # Parse comma-separated sheet_status (e.g. Approved for Release,Paid)
    sheet_status_values = {s.value for s in SheetStatus}
    sheet_status_list: list[str] = []
    if sheet_status:
        parts = [p.strip() for p in sheet_status.split(",") if p.strip()]
        for p in parts:
            if p in sheet_status_values:
                sheet_status_list.append(p)
            else:
                for sv in SheetStatus:
                    if sv.value.lower() == p.lower():
                        sheet_status_list.append(sv.value)
                        break

    query: dict = {}
    if search:
        s = search.strip()
        query["$or"] = [
            {"invoice_number": {"$regex": s, "$options": "i"}},
            {"vendor_name": {"$regex": s, "$options": "i"}},
        ]

    if payment_status:
        query["payment_status"] = payment_status
    if department:
        query["department"] = department
    if sheet_status_list:
        if len(sheet_status_list) == 1:
            query["sheet_status"] = sheet_status_list[0]
        else:
            query["sheet_status"] = {"$in": sheet_status_list}
    if company_name:
        query["company_name"] = company_name
    if vendor:
        query["vendor_name"] = {"$regex": f"^{vendor}$", "$options": "i"}

    # Department-based scoping: non-Accounts employees can only see their own department
    user_dept = (user.department or "").strip().lower()
    if user.role not in ("admin", "superadmin") and user_dept != "accounts":
        # If a department filter is already provided, intersect it with the user's department
        query["department"] = user.department

    # Accounts review flow: Admin and creator only see invoices after Accounts has reviewed
    # Optional: when awaiting_accounts_review=1 and caller is Accounts or Admin, show only unreviewed Pending
    not_deleted = [
        {"deleted_at": {"$exists": False}},
        {"deleted_at": None},
    ]
    is_accounts_or_admin = user.role in ("admin", "superadmin") or (
        user.role == "employee" and user_dept == "accounts"
    )
    if awaiting_accounts_review and is_accounts_or_admin:
        # Match workflow Pending (case-insensitive so "Pending" / "pending" in DB both match)
        query["sheet_status"] = {"$regex": r"^Pending$", "$options": "i"}
        query["$and"] = query.get("$and", [])
        query["$and"].append(
            {
                "$or": [
                    {"accounts_reviewed_at": {"$exists": False}},
                    {"accounts_reviewed_at": None},
                ]
            }
        )
        query["$and"].append({"$or": not_deleted})
    else:
        if user.role in ("admin", "superadmin"):
            query["accounts_reviewed_at"] = {"$exists": True, "$ne": None}
        elif user.role == "employee" and user_dept != "accounts":
            # Show invoices that are accounts-reviewed OR created by this user (so they see their own submissions)
            query["$and"] = query.get("$and", [])
            query["$and"].append(
                {
                    "$or": [
                        {"accounts_reviewed_at": {"$exists": True, "$ne": None}},
                        {"created_by": user.user_db_id},
                    ]
                }
            )
        # Exclude soft-deleted invoices from all lists
        query["$or"] = not_deleted

    # Support filtering by computed status (legacy) when "status" is used (normalize to lowercase)
    status_normalized = (status or "").strip().lower() if status else None
    computed_status_filter = status_normalized in ("paid", "overdue", "due_soon", "pending")
    # Use normalized value for comparisons so "Pending" / "PENDING" still mean pending
    status_for_filter = status_normalized if computed_status_filter else None

    # When filtering by computed status or priority we must fetch candidates and filter in Python,
    # then paginate (status/priority are derived, not stored).
    use_in_memory_filter = computed_status_filter or bool(priority_set)
    if use_in_memory_filter:
        if computed_status_filter and status_for_filter == "paid":
            query["payment_status"] = "paid"
        elif computed_status_filter and status_for_filter in ("pending", "due_soon", "overdue"):
            query["payment_status"] = {"$ne": "paid"}

    # Pagination
    skip = (page - 1) * page_size
    limit = page_size

    sort_key = sort_by
    sort_dir = -1 if sort_order == "desc" else 1

    if use_in_memory_filter:
        # Fetch all candidates (cap to avoid huge memory use), filter in Python, then paginate
        fetch_limit = 10_000
        cursor = db["invoices"].find(query).sort(sort_key, sort_dir)
        docs = await cursor.to_list(length=fetch_limit)
    else:
        cursor = db["invoices"].find(query).sort(sort_key, sort_dir)
        total = await db["invoices"].count_documents(query)
        docs = await cursor.skip(skip).limit(limit).to_list(length=limit)

    rows: list[InvoiceResponse] = []
    for inv in docs:
        inv_id = str(inv["_id"])
        inv_due = inv.get("due_date")
        inv_sheet_status = inv.get("sheet_status")
        inv_payment = inv.get("payment_status") or _payment_status_from_sheet_status(inv_sheet_status)
        computed_status = derive_invoice_status(inv_due, inv_payment)
        inv_priority = calculate_priority(
            inv_due,
            inv.get("pay_cycle"),
            inv_payment,
            sheet_status=inv.get("sheet_status"),
            manual_priority=inv.get("priority"),
        )

        # Require computed status to match exactly (pending = not due_soon, not overdue; only future or no due date)
        if computed_status_filter and computed_status != status_for_filter:
            continue

        # Require priority to be in the requested set (e.g. high and/or critical)
        if priority_set and inv_priority not in priority_set:
            continue

        rows.append(
            InvoiceResponse(
                id=inv_id,
                invoice_number=inv.get("invoice_number"),
                vendor_name=inv.get("vendor_name"),
                department=inv.get("department"),
                company_name=inv.get("company_name"),
                description=inv.get("description"),
                total_amount=inv.get("total_amount"),
                currency=_normalize_currency(inv.get("currency")),
                due_date=inv.get("due_date"),
                status=inv.get("sheet_status") or computed_status,
                payment_status=inv_payment,
                priority=inv_priority,
                created_by=str(inv.get("created_by")) if inv.get("created_by") is not None else None,
                created_by_name=inv.get("created_by_name"),
                created_at=inv.get("created_at"),
                updated_at=inv.get("updated_at"),
                approved_at=inv.get("approved_at"),
                approved_by=inv.get("approved_by"),
                paid_at=inv.get("paid_at"),
                paid_by=inv.get("paid_by"),
                upload_date=inv.get("upload_date"),
                sheet_status=inv.get("sheet_status"),
                pay_cycle=inv.get("pay_cycle"),
                on_hold_by=inv.get("on_hold_by"),
                remarks=inv.get("remarks"),
                accounts_reviewed_at=inv.get("accounts_reviewed_at"),
                accounts_reviewed_by=inv.get("accounts_reviewed_by"),
            )
        )

    # Sort order: when multiple priorities (e.g. high,critical), show critical first then high
    if priority_set and len(priority_set) >= 2 and ("critical" in priority_set or "high" in priority_set):
        _priority_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        rows.sort(key=lambda r: _priority_rank.get(r.priority or "low", 4))

    # Sort order: when multiple sheet_status (e.g. Approved for Release + Paid), show Approved first then Paid
    if len(sheet_status_list) >= 2 and any(s in sheet_status_list for s in (SheetStatus.APPROVED_FOR_RELEASE.value, SheetStatus.PAID.value)):
        _sheet_order = {SheetStatus.APPROVED_FOR_RELEASE.value: 0, SheetStatus.PAID.value: 1}
        def _sheet_key(r):
            v = r.sheet_status or ""
            return _sheet_order.get(v, 99)
        rows.sort(key=_sheet_key)

    if use_in_memory_filter:
        total = len(rows)
        rows = rows[skip : skip + limit]
    # else: total already set from count_documents(query) before the loop

    return InvoiceListResponse(data=rows, total=total, page=page, page_size=page_size)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    db = get_db()
    inv = await db["invoices"].find_one(_invoice_id_query(invoice_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Accounts review flow: Admin and non-Accounts employees only see invoice after Accounts has reviewed
    accounts_reviewed_at = inv.get("accounts_reviewed_at")
    if user.role in ("admin", "superadmin"):
        if not accounts_reviewed_at:
            raise HTTPException(status_code=404, detail="Invoice not found")
    invoice_department = (inv.get("department") or "accounts").lower()
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        if invoice_department != user.department:
            raise HTTPException(status_code=403, detail="Access denied for this invoice")
        # Creator can always see their own invoice (e.g. right after create); others need accounts review
        is_creator = inv.get("created_by") == user.user_db_id
        if not accounts_reviewed_at and not is_creator:
            raise HTTPException(status_code=403, detail="Access denied for this invoice")
    inv_sheet_status = inv.get("sheet_status")
    inv_payment = inv.get("payment_status") or _payment_status_from_sheet_status(inv_sheet_status)
    computed_status = derive_invoice_status(inv.get("due_date"), inv_payment)
    inv_priority = calculate_priority(
        inv.get("due_date"),
        inv.get("pay_cycle"),
        inv_payment,
        sheet_status=inv.get("sheet_status"),
        manual_priority=inv.get("priority"),
    )
    return InvoiceResponse(
        id=str(inv["_id"]),
        invoice_number=inv.get("invoice_number"),
        vendor_name=inv.get("vendor_name"),
        department=inv.get("department"),
        company_name=inv.get("company_name"),
        description=inv.get("description"),
        total_amount=inv.get("total_amount"),
        currency=_normalize_currency(inv.get("currency")),
        due_date=inv.get("due_date"),
        status=inv.get("sheet_status") or computed_status,
        payment_status=inv_payment,
        priority=inv_priority,
        created_by=str(inv.get("created_by")) if inv.get("created_by") is not None else None,
        created_by_name=inv.get("created_by_name"),
        created_at=inv.get("created_at"),
        updated_at=inv.get("updated_at"),
        approved_at=inv.get("approved_at"),
        approved_by=inv.get("approved_by"),
        paid_at=inv.get("paid_at"),
        paid_by=inv.get("paid_by"),
        upload_date=inv.get("upload_date"),
        sheet_status=inv.get("sheet_status"),
        pay_cycle=inv.get("pay_cycle"),
        deleted_at=inv.get("deleted_at"),
        deleted_by=inv.get("deleted_by"),
        on_hold_by=inv.get("on_hold_by"),
        remarks=inv.get("remarks"),
        accounts_reviewed_at=inv.get("accounts_reviewed_at"),
        accounts_reviewed_by=inv.get("accounts_reviewed_by"),
    )


@router.post("", response_model=InvoiceResponse)
async def create_invoice(
    invoice: InvoiceCreate,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Create invoice (employee can add). Accounts review flow: employee cannot set priority; only Accounts sets it via accounts-review."""
    db = get_db()
    inv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = _normalize_for_mongo(invoice.model_dump(exclude_none=True))
    # Only Accounts (or admin) set priority and remarks via accounts-review; never from create
    for key in ("remarks", "accounts_reviewed_at", "accounts_reviewed_by"):
        doc.pop(key, None)
    if user.role == "employee":
        doc.pop("priority", None)  # Only Accounts sets priority when they review
    sheet_status = (doc.get("sheet_status") or SheetStatus.PENDING.value)
    # Default upload_date to today's date if not provided
    if "upload_date" not in doc or doc.get("upload_date") is None:
        doc["upload_date"] = date.today().isoformat()
    doc.update(
        {
            "_id": inv_id,
            "payment_status": _payment_status_from_sheet_status(sheet_status),
            "created_by": user.user_db_id,
            "created_by_name": user.name,
            "created_at": now,
            "updated_at": now,
            "sheet_status": sheet_status,
            # Tag invoice with creator's department for access control
            "department": user.department,
        }
    )
    result = await db["invoices"].insert_one(doc)
    if not result.acknowledged:
        raise HTTPException(status_code=500, detail="Insert was not acknowledged by database")
    verified = await db["invoices"].find_one({"_id": inv_id})
    if not verified:
        raise HTTPException(
            status_code=500,
            detail=f"Invoice created but could not be read back (id={inv_id}). Check database connection.",
        )
    schedule_notification(notify_invoice_created(doc))
    return await get_invoice(inv_id, user=user)  # reuse


@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: str,
    invoice_update: InvoiceUpdate,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Update an invoice. Admin/Employee can update limited fields for sheets flow."""
    db = get_db()
    existing = await db["invoices"].find_one(_invoice_id_query(invoice_id, include_deleted=True))
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Department-based permission: non-Accounts employees can update only their department's invoices
    invoice_department = (existing.get("department") or "accounts").lower()
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        if invoice_department != user.department:
            raise HTTPException(status_code=403, detail="Access denied for this invoice")
    update_data = _normalize_for_mongo(
        invoice_update.model_dump(exclude_unset=True, exclude_none=True)
    )
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db["invoices"].update_one({"_id": invoice_id}, {"$set": update_data})
    return await get_invoice(invoice_id, user=user)


@router.post("/{invoice_id}/accounts-review", response_model=InvoiceResponse)
async def submit_accounts_review(
    invoice_id: str,
    body: AccountsReviewUpdate,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Accounts department sets priority and remarks; after this, invoice becomes visible to Admin and creator."""
    if user.role == "employee" and user.department != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can submit accounts review",
        )
    db = get_db()
    filter_query = _invoice_id_query(invoice_id)
    existing = await db["invoices"].find_one(filter_query)
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    current_status = existing.get("sheet_status") or SheetStatus.PENDING.value
    if current_status == SheetStatus.PAID.value:
        raise HTTPException(status_code=400, detail="Paid invoices cannot be reviewed")
    now = datetime.now(timezone.utc).isoformat()
    update_payload = {
        "priority": body.priority.value,
        "remarks": body.remarks or None,
        "accounts_reviewed_at": now,
        "accounts_reviewed_by": user.user_db_id,
        "updated_at": now,
    }
    await db["invoices"].update_one(filter_query, {"$set": update_payload})
    return await get_invoice(invoice_id, user=user)


@router.post("/{invoice_id}/accounts-reject")
async def accounts_reject_invoice(
    invoice_id: str,
    body: AccountsRejectBody,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Accounts department rejects an invoice: put On Hold with optional remarks. Invoice leaves pending review list."""
    if user.role == "employee" and (user.department or "").strip().lower() != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can reject invoices",
        )
    db = get_db()
    # Prefer direct _id match (string) so we match how create_invoice stores _id
    existing = await db["invoices"].find_one(_invoice_id_query(invoice_id.strip()))
    if not existing and not _is_uuid_like(invoice_id.strip()):
        not_deleted = {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]}
        existing = await db["invoices"].find_one(
            {"$and": [{"invoice_number": {"$regex": f"^{invoice_id.strip()}$", "$options": "i"}}, not_deleted]}
        )
    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"Invoice not found (id={invoice_id!r}). It may not have been saved yet, or the id may be wrong.",
        )
    real_id = str(existing["_id"])
    filter_query = _invoice_id_query(real_id)
    current = existing.get("sheet_status") or SheetStatus.PENDING.value
    if current == SheetStatus.PAID.value:
        raise HTTPException(status_code=400, detail="Paid invoices cannot be rejected")
    remarks_value = body.remarks or None
    now = datetime.now(timezone.utc).isoformat()
    update_payload = {
        "sheet_status": SheetStatus.ON_HOLD.value,
        "on_hold_by": "admin" if user.role in ("admin", "superadmin") else "accounts",
        "remarks": remarks_value,
        "updated_at": now,
    }
    await db["invoices"].update_one(filter_query, {"$set": update_payload})
    updated_inv = {**existing, **update_payload}
    if update_payload["on_hold_by"] == "accounts":
        schedule_notification(notify_invoice_on_hold_by_accounts(updated_inv))
    else:
        schedule_notification(notify_invoice_on_hold_by_admin(updated_inv))
    return {"message": "Invoice rejected (set to On Hold)"}


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("superadmin")),
):
    """Delete an invoice. Superadmin only."""
    db = get_db()
    existing = await db["invoices"].find_one(_invoice_id_query(invoice_id, include_deleted=True))
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    await db["invoices"].delete_one({"_id": invoice_id})
    return {"message": "Invoice deleted successfully"}


class ApproveAllRequest(BaseModel):
    company_name: str
    vendor_name: str


@router.post("/approve-all")
async def approve_all_by_vendor(
    body: ApproveAllRequest = Body(...),
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """
    Set all invoices for a given company + vendor to Approved for Release.
    Skips already Paid invoices. Applies to Pending, On Hold, and any other non-Paid status.
    """
    db = get_db()
    company = (body.company_name or "").strip()
    vendor = (body.vendor_name or "").strip()
    if not company or not vendor:
        raise HTTPException(status_code=400, detail="company_name and vendor_name required")

    # Only Accounts department or admins/superadmins can run bulk approve-all across departments
    if user.role == "employee" and user.department != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can approve all invoices for a vendor",
        )

    query = {
        "company_name": {"$regex": f"^{company}$", "$options": "i"},
        "vendor_name": {"$regex": f"^{vendor}$", "$options": "i"},
        "sheet_status": {"$ne": SheetStatus.PAID.value},
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    now = datetime.now(timezone.utc).isoformat()
    result = await db["invoices"].update_many(
        query,
        {
            "$set": {
                "sheet_status": SheetStatus.APPROVED_FOR_RELEASE.value,
                "priority": "high",
                "approved_at": now,
                "approved_by": user.user_db_id,
                "updated_at": now,
            }
        },
    )
    return {"message": "Invoices approved for release", "updated_count": result.modified_count}


@router.post("/{invoice_id}/proceed")
async def proceed_payment(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Admin proceeds: Pending -> Approved for Release.

    Once an invoice is Paid, it must never be moved forward again in the workflow,
    so this endpoint explicitly rejects any Paid invoice.
    """
    db = get_db()
    filter_query = _invoice_id_query(invoice_id)
    existing = await db["invoices"].find_one(filter_query)
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Admin can proceed only Pending invoices.
    # Paid invoices are hard-blocked from any further workflow actions.
    current_status = existing.get("sheet_status") or SheetStatus.PENDING.value
    if current_status == SheetStatus.PAID.value:
        raise HTTPException(status_code=400, detail="Paid invoices cannot be proceeded")
    if current_status != SheetStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Only Pending invoices can be proceeded")
    await db["invoices"].update_one(
        filter_query,
        {
            "$set": {
                "sheet_status": SheetStatus.APPROVED_FOR_RELEASE.value,
                "priority": "high",
                "approved_at": datetime.now(timezone.utc).isoformat(),
                "approved_by": user.user_db_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    updated = {**existing, "sheet_status": SheetStatus.APPROVED_FOR_RELEASE.value, "approved_by": user.user_db_id}
    schedule_notification(notify_invoice_approved(updated))
    return {"message": "Invoice approved for release"}


@router.post("/{invoice_id}/hold")
async def set_on_hold(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Admin or Employee can set/unset On Hold (Pending ↔ On Hold)."""
    db = get_db()
    filter_query = _invoice_id_query(invoice_id)
    existing = await db["invoices"].find_one(filter_query)
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice_department = (existing.get("department") or "accounts").lower()
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        if invoice_department != user.department:
            raise HTTPException(status_code=403, detail="Access denied for this invoice")
    current = existing.get("sheet_status") or SheetStatus.PENDING.value
    if current == SheetStatus.PAID.value:
        raise HTTPException(status_code=400, detail="Paid invoices cannot be put on hold")
    next_status = SheetStatus.PENDING.value if current == SheetStatus.ON_HOLD.value else SheetStatus.ON_HOLD.value
    on_hold_by = None
    if next_status == SheetStatus.ON_HOLD.value:
        on_hold_by = "admin" if user.role in ("admin", "superadmin") else "accounts"
    update_payload = {
        "sheet_status": next_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if next_status == SheetStatus.ON_HOLD.value:
        update_payload["on_hold_by"] = on_hold_by
    else:
        update_payload["on_hold_by"] = None
    await db["invoices"].update_one(filter_query, {"$set": update_payload})
    if next_status == SheetStatus.ON_HOLD.value and on_hold_by:
        updated_inv = {**existing, "sheet_status": next_status, "on_hold_by": on_hold_by}
        if on_hold_by == "admin":
            schedule_notification(notify_invoice_on_hold_by_admin(updated_inv))
        else:
            schedule_notification(notify_invoice_on_hold_by_accounts(updated_inv))
    return {"message": f"Invoice status set to {next_status}"}


@router.post("/{invoice_id}/mark-paid")
async def mark_paid(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("employee")),
):
    """Employee marks invoice as paid. Only allowed from Approved for Release."""
    db = get_db()
    filter_query = _invoice_id_query(invoice_id)
    existing = await db["invoices"].find_one(filter_query)
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice_department = (existing.get("department") or "accounts").lower()
    if user.department != "accounts" and invoice_department != user.department:
        raise HTTPException(status_code=403, detail="Access denied for this invoice")
    if existing.get("sheet_status") == SheetStatus.PAID.value:
        raise HTTPException(status_code=400, detail="Invoice is already marked as Paid")
    if existing.get("sheet_status") != SheetStatus.APPROVED_FOR_RELEASE.value:
        raise HTTPException(
            status_code=400,
            detail="Invoice must be Approved for Release to mark as Paid",
        )
    await db["invoices"].update_one(
        filter_query,
        {
            "$set": {
                "sheet_status": SheetStatus.PAID.value,
                "payment_status": "paid",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    updated_inv = {**existing, "sheet_status": SheetStatus.PAID.value, "payment_status": "paid"}
    schedule_notification(notify_invoice_paid(updated_inv))
    return {"message": "Invoice marked as paid"}


@router.post("/{invoice_id}/soft-delete")
async def soft_delete_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Soft delete an invoice: mark deleted_at/deleted_by and hide from all lists."""
    db = get_db()
    existing = await db["invoices"].find_one(_invoice_id_query(invoice_id, include_deleted=True))
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice_department = (existing.get("department") or "accounts").lower()
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        if invoice_department != user.department:
            raise HTTPException(status_code=403, detail="Access denied for this invoice")

    now = datetime.now(timezone.utc).isoformat()
    await db["invoices"].update_one(
        {"_id": invoice_id},
        {
            "$set": {
                "deleted_at": now,
                "deleted_by": user.user_db_id,
                "updated_at": now,
            }
        },
    )
    return {"message": "Invoice soft deleted successfully"}
