"""
Dashboard Router — Analytics endpoints
Accessible by superadmin and admin.
"""

from fastapi import APIRouter, Depends
from app.auth.middleware import CurrentUser, require_role
from app.database import get_db
from app.models.schemas import DashboardSummary, AgingBucket, PriorityBucket, UpcomingPayment, OverdueAlert, DashboardAllResponse, SheetStatus
from app.services.invoice_logic import (
    derive_invoice_status,
    calculate_aging_bucket,
    calculate_priority,
    calculate_days_until_due,
)
from datetime import date, timedelta


router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Get KPI summary data for the dashboard."""
    db = get_db()
    base_query: dict = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    # If in future we open dashboard to employees, we can add department scoping here.
    invoices = await db["invoices"].find(base_query).to_list(length=10_000)
    today = date.today()
    month_start = date(today.year, today.month, 1)

    total_payables = 0.0
    due_in_7_days = 0.0
    overdue_amount = 0.0
    paid_this_month = 0.0
    overdue_count = 0
    pending_amount = 0.0
    pending_count = 0
    upcoming_7_days_count = 0
    high_priority_pending_count = 0
    approved_and_paid_count = 0

    for inv in invoices:
        amount = inv.get("total_amount") or 0
        due_str = inv.get("due_date")
        payment_status = inv.get("payment_status", "unpaid")

        status = derive_invoice_status(due_str, payment_status)

        if payment_status != "paid":
            total_payables += amount

        # Parse due_date for date‑range logic
        try:
            due_date = (
                due_str
                and date.fromisoformat(str(due_str).replace("Z", "").split("T")[0])
            )
        except (ValueError, TypeError):
            due_date = None

        if status == "overdue":
            overdue_amount += amount
            overdue_count += 1
        if status == "pending":
            pending_amount += amount
            pending_count += 1

        # Upcoming in next 7 days (not paid)
        if payment_status != "paid" and due_date and today <= due_date <= today + timedelta(days=7):
            upcoming_7_days_count += 1
            due_in_7_days += amount

        # Critical Pending = workflow Pending (sheet_status) + high or critical priority
        sheet_status_val = inv.get("sheet_status")
        if sheet_status_val is not None and str(sheet_status_val).strip().lower() == "pending":
            priority = calculate_priority(
                due_str,
                inv.get("pay_cycle"),
                payment_status,
                sheet_status=sheet_status_val,
                manual_priority=inv.get("priority"),
            )
            if priority in ("high", "critical"):
                high_priority_pending_count += 1

        # Approved for Release or Paid (for fourth card count)
        if sheet_status_val in (SheetStatus.APPROVED_FOR_RELEASE.value, SheetStatus.PAID.value):
            approved_and_paid_count += 1

        # Paid this month: payment_status paid and paid_at in current month
        if payment_status == "paid":
            paid_at_str = inv.get("paid_at")
            try:
                paid_at = (
                    paid_at_str
                    and date.fromisoformat(str(paid_at_str).replace("Z", "").split("T")[0])
                )
            except (ValueError, TypeError):
                paid_at = None
            if paid_at and paid_at >= month_start and paid_at.month == today.month:
                paid_this_month += amount

    return DashboardSummary(
        total_payables=total_payables,
        due_in_7_days=due_in_7_days,
        overdue_amount=overdue_amount,
        paid_this_month=paid_this_month,
        total_invoices=len(invoices),
        overdue_count=overdue_count,
        pending_amount=pending_amount,
        pending_count=pending_count,
        upcoming_7_days_count=upcoming_7_days_count,
        high_priority_pending_count=high_priority_pending_count,
        approved_and_paid_count=approved_and_paid_count,
    )


@router.get("/aging")
async def get_aging_data(
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Get invoice aging breakdown."""
    db = get_db()
    base_query: dict = {
        "payment_status": {"$ne": "paid"},
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    result = await db["invoices"].find(base_query).to_list(length=10_000)
    buckets = {"0-30": {"amount": 0, "count": 0}, "31-60": {"amount": 0, "count": 0},
               "61-90": {"amount": 0, "count": 0}, "90+": {"amount": 0, "count": 0}}

    for inv in result:
        bucket = calculate_aging_bucket(inv.get("due_date"))
        amount = inv.get("total_amount") or 0
        buckets[bucket]["amount"] += amount
        buckets[bucket]["count"] += 1

    return {
        "data": [
            AgingBucket(bucket=k, amount=v["amount"], count=v["count"])
            for k, v in buckets.items()
        ]
    }


@router.get("/upcoming-payments")
async def get_upcoming_payments(
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Get invoices due in the next 30 days."""
    today = date.today()
    future = today + timedelta(days=30)

    db = get_db()
    base_query: dict = {
        "payment_status": {"$ne": "paid"},
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    result = await db["invoices"].find(base_query).to_list(length=10_000)
    upcoming = []
    for inv in result:
        days_left = calculate_days_until_due(inv.get("due_date"))
        status = derive_invoice_status(inv.get("due_date"), inv.get("payment_status", "unpaid"))
        if status != "due_soon":
            continue
        inv_currency = (inv.get("currency") or "INR").strip().upper() or "INR"
        upcoming.append(
            UpcomingPayment(
                id=str(inv["_id"]),
                vendor_name=inv.get("vendor_name", "Unknown"),
                invoice_number=inv.get("invoice_number"),
                total_amount=inv.get("total_amount") or 0,
                currency=inv_currency,
                due_date=inv.get("due_date", ""),
                days_left=days_left,
                status=status,
            )
        )

    return {"data": upcoming}


@router.get("/overdue-alerts")
async def get_overdue_alerts(
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Get all overdue invoices."""
    today = date.today()
    db = get_db()
    base_query: dict = {
        "payment_status": {"$ne": "paid"},
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ],
    }
    result = await db["invoices"].find(base_query).to_list(length=10_000)
    overdue = []
    for inv in result:
        status = derive_invoice_status(inv.get("due_date"), inv.get("payment_status", "unpaid"))
        if status != "overdue":
            continue
        days_overdue = abs(calculate_days_until_due(inv.get("due_date")))
        priority = calculate_priority(
            inv.get("due_date"),
            inv.get("pay_cycle"),
            inv.get("payment_status", "unpaid"),
            sheet_status=inv.get("sheet_status"),
            manual_priority=inv.get("priority"),
        )
        inv_currency = (inv.get("currency") or "INR").strip().upper() or "INR"
        overdue.append(
            OverdueAlert(
                id=str(inv["_id"]),
                vendor_name=inv.get("vendor_name", "Unknown"),
                invoice_number=inv.get("invoice_number"),
                total_amount=inv.get("total_amount") or 0,
                currency=inv_currency,
                due_date=inv.get("due_date", ""),
                days_overdue=days_overdue,
                priority=priority,
            )
        )

    return {"data": overdue}


@router.get("/all", response_model=DashboardAllResponse)
async def get_dashboard_all(
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """
    Get all dashboard data in one request: summary, aging, upcoming, overdue.
    Single DB round-trip for better performance.
    """
    db = get_db()
    today = date.today()
    day7 = today + timedelta(days=7)
    day30 = today + timedelta(days=30)
    month_start = date(today.year, today.month, 1)

    today_s = today.isoformat()
    day7_s = day7.isoformat()
    day30_s = day30.isoformat()
    month_start_s = month_start.isoformat()

    not_deleted: dict = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
        ]
    }
    # Admin dashboard: only invoices visible on admin list (accounts-reviewed), so all metrics match
    reviewed = {"accounts_reviewed_at": {"$exists": True, "$ne": None}}
    base_query = {**reviewed, **not_deleted}

    proj = {
        "vendor_name": 1,
        "invoice_number": 1,
        "total_amount": 1,
        "due_date": 1,
        "payment_status": 1,
        "paid_at": 1,
        "pay_cycle": 1,
        "sheet_status": 1,
        "priority": 1,
    }

    total_invoices = await db["invoices"].count_documents(base_query)
    approved_and_paid_query = {
        "sheet_status": {"$in": [SheetStatus.APPROVED_FOR_RELEASE.value, SheetStatus.PAID.value]},
        **base_query,
    }
    approved_and_paid_count = await db["invoices"].count_documents(approved_and_paid_query)
    # Critical Pending count must match the list filter (sheet_status=Pending + priority high/critical)
    pending_sheet_query = {
        "sheet_status": {"$regex": r"^Pending$", "$options": "i"},
        **base_query,
    }
    pending_sheet_docs = await db["invoices"].find(pending_sheet_query, proj).to_list(length=10_000)
    high_priority_pending_count = 0
    for inv in pending_sheet_docs:
        ss = inv.get("sheet_status")
        if ss is None or str(ss).strip().lower() != "pending":
            continue
        priority_val = calculate_priority(
            inv.get("due_date"),
            inv.get("pay_cycle"),
            inv.get("payment_status") or "unpaid",
            sheet_status=ss,
            manual_priority=inv.get("priority"),
        )
        if priority_val in ("high", "critical"):
            high_priority_pending_count += 1

    unpaid_query = {"payment_status": {"$ne": "paid"}, **base_query}
    unpaid_docs = await db["invoices"].find(unpaid_query, proj).to_list(length=10_000)
    paid_month_query = {"payment_status": "paid", "paid_at": {"$gte": month_start_s}, **base_query}
    paid_month_docs = await db["invoices"].find(paid_month_query, {"total_amount": 1}).to_list(length=10_000)

    total_payables = 0.0
    due_in_7_days = 0.0
    overdue_amount = 0.0
    paid_this_month = 0.0
    overdue_count = 0
    pending_amount = 0.0
    pending_count = 0
    upcoming_7_days_count = 0
    buckets = {
        "0-30": {"amount": 0, "count": 0},
        "31-60": {"amount": 0, "count": 0},
        "61-90": {"amount": 0, "count": 0},
        "90+": {"amount": 0, "count": 0},
    }
    priority_buckets = {
        "high": {"amount": 0, "count": 0},
        "medium": {"amount": 0, "count": 0},
        "low": {"amount": 0, "count": 0},
    }
    upcoming = []
    overdue = []

    for inv in unpaid_docs:
        amount = inv.get("total_amount") or 0
        due_str = inv.get("due_date")
        payment_status = inv.get("payment_status", "unpaid")
        status = derive_invoice_status(due_str, payment_status)

        total_payables += amount
        due_key = str(due_str).replace("Z", "").split("T")[0] if due_str else None

        if status == "overdue":
            overdue_amount += amount
            overdue_count += 1
        if status == "pending":
            pending_amount += amount
            pending_count += 1

        if due_key and today_s <= due_key <= day7_s:
            upcoming_7_days_count += 1
            due_in_7_days += amount

        bucket = calculate_aging_bucket(due_str)
        buckets[bucket]["amount"] += amount
        buckets[bucket]["count"] += 1

        # Priority breakdown (group "critical" into "high" bucket)
        priority_val = calculate_priority(
            due_str,
            inv.get("pay_cycle"),
            payment_status,
            sheet_status=inv.get("sheet_status"),
            manual_priority=inv.get("priority"),
        )
        priority_key = "high" if priority_val in ("high", "critical") else priority_val
        if priority_key in priority_buckets:
            priority_buckets[priority_key]["amount"] += amount
            priority_buckets[priority_key]["count"] += 1

        # Upcoming and overdue lists (only unpaid)
        if due_key and today_s <= due_key <= day30_s:
            inv_currency = (inv.get("currency") or "INR").strip().upper() or "INR"
            upcoming.append(
                UpcomingPayment(
                    id=str(inv["_id"]),
                    vendor_name=inv.get("vendor_name", "Unknown"),
                    invoice_number=inv.get("invoice_number"),
                    total_amount=amount,
                    currency=inv_currency,
                    due_date=str(inv.get("due_date", "")),
                    days_left=calculate_days_until_due(due_str),
                    status=status,
                )
            )
        elif due_key and due_key < today_s:
            days_overdue = abs(calculate_days_until_due(due_str))
            priority = calculate_priority(
                due_str,
                inv.get("pay_cycle"),
                payment_status,
                sheet_status=inv.get("sheet_status"),
                manual_priority=inv.get("priority"),
            )
            inv_currency = (inv.get("currency") or "INR").strip().upper() or "INR"
            overdue.append(
                OverdueAlert(
                    id=str(inv["_id"]),
                    vendor_name=inv.get("vendor_name", "Unknown"),
                    invoice_number=inv.get("invoice_number"),
                    total_amount=amount,
                    currency=inv_currency,
                    due_date=str(inv.get("due_date", "")),
                    days_overdue=days_overdue,
                    priority=priority,
                )
            )

    for inv in paid_month_docs:
        paid_this_month += inv.get("total_amount") or 0
    # Sort upcoming by due_date, overdue by due_date
    upcoming.sort(key=lambda x: x.due_date)
    overdue.sort(key=lambda x: x.due_date)

    summary = DashboardSummary(
        total_payables=total_payables,
        due_in_7_days=due_in_7_days,
        overdue_amount=overdue_amount,
        paid_this_month=paid_this_month,
        total_invoices=total_invoices,
        overdue_count=overdue_count,
        pending_amount=pending_amount,
        pending_count=pending_count,
        upcoming_7_days_count=upcoming_7_days_count,
        high_priority_pending_count=high_priority_pending_count,
        approved_and_paid_count=approved_and_paid_count,
    )
    aging = [AgingBucket(bucket=k, amount=v["amount"], count=v["count"]) for k, v in buckets.items()]
    priority_breakdown = [
        PriorityBucket(priority=k, amount=v["amount"], count=v["count"]) for k, v in priority_buckets.items()
    ]

    return DashboardAllResponse(
        summary=summary,
        aging=aging,
        priority_breakdown=priority_breakdown,
        upcoming=upcoming,
        overdue=overdue,
    )
