"""
Invoice Business Logic Service
Handles status derivation, aging calculation, and priority assessment.
"""

from datetime import date, datetime
from typing import Optional


def derive_invoice_status(due_date_str: Optional[str], payment_status: str) -> str:
    """
    Derive the display status for an invoice.
    - paid: payment completed
    - overdue: past due and unpaid
    - due_soon: due within 7 days
    - pending: not yet due
    """
    if payment_status == "paid":
        return "paid"

    if not due_date_str:
        return "pending"

    try:
        if isinstance(due_date_str, str):
            due = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")).date()
        else:
            due = due_date_str
    except (ValueError, TypeError):
        return "pending"

    today = date.today()
    days_until_due = (due - today).days

    if days_until_due < 0:
        return "overdue"
    elif days_until_due <= 7:
        return "due_soon"
    else:
        return "pending"


def calculate_aging_bucket(due_date_str: Optional[str]) -> str:
    """
    Calculate aging bucket based on days past due.
    Returns: "0-30", "31-60", "61-90", "90+"
    """
    if not due_date_str:
        return "0-30"

    try:
        if isinstance(due_date_str, str):
            due = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")).date()
        else:
            due = due_date_str
    except (ValueError, TypeError):
        return "0-30"

    today = date.today()
    days_overdue = (today - due).days

    if days_overdue <= 30:
        return "0-30"
    elif days_overdue <= 60:
        return "31-60"
    elif days_overdue <= 90:
        return "61-90"
    else:
        return "90+"


def calculate_priority(
    due_date_str: Optional[str],
    pay_cycle: Optional[str],
    payment_status: str,
    sheet_status: Optional[str] = None,
    manual_priority: Optional[str] = None,
) -> str:
    """
    Calculate priority (shared business rules).

    Rules (per product requirements):
    - Newly created invoices default to Pending status.
    - Priority is primarily driven by due_date vs today:
      - Far away => low
      - Coming soon (within 7 days) => high
      - Overdue => high
      - Overdue more than pay_cycle days => critical (very high)
    - If admin approves (Approved for Release), priority is high.
    - If an invoice is paid, priority is low.

    If a manual priority exists, we keep it unless the computed priority is higher
    severity (e.g. overdue escalates to high/critical).
    """
    severity = {"low": 0, "medium": 1, "high": 2, "critical": 3}

    def norm(p: Optional[str]) -> Optional[str]:
        if not p:
            return None
        p2 = str(p).strip().lower().replace(" ", "_")
        # allow "very_high" synonym to map to critical
        if p2 in ("very_high", "veryhigh", "critical"):
            return "critical"
        if p2 in severity:
            return p2
        return None

    if payment_status == "paid" or (sheet_status == "Paid"):
        return "low"

    computed = "low"
    if sheet_status == "Approved for Release":
        computed = "high"
    else:
        if due_date_str:
            try:
                if isinstance(due_date_str, str):
                    due = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")).date()
                else:
                    due = due_date_str
            except (ValueError, TypeError):
                due = None

            if due:
                today = date.today()
                days_until_due = (due - today).days
                if days_until_due < 0:
                    days_overdue = (today - due).days
                    try:
                        cycle_days = int(str(pay_cycle or "0").strip() or "0")
                    except ValueError:
                        cycle_days = 0
                    if cycle_days > 0 and days_overdue > cycle_days:
                        computed = "critical"
                    else:
                        computed = "high"
                elif days_until_due <= 7:
                    computed = "high"
                else:
                    computed = "low"

    manual = norm(manual_priority)
    if not manual:
        return computed
    return manual if severity[manual] >= severity[computed] else computed


def calculate_days_until_due(due_date_str: Optional[str]) -> int:
    """Calculate days until due date. Negative means overdue."""
    if not due_date_str:
        return 999

    try:
        if isinstance(due_date_str, str):
            due = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")).date()
        else:
            due = due_date_str
    except (ValueError, TypeError):
        return 999

    return (due - date.today()).days
