"""
Invoice notification triggers: resolve recipients and send emails via email_service.
Each function is fire-and-forget (caller should use asyncio.create_task).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.services.email_service import send_email
from app.services.notification_recipients import get_creator_email, get_emails_by_department

logger = logging.getLogger(__name__)


def _build_invoice_email(
    invoice: dict[str, Any],
    *,
    status_label: str,
    hero_icon: str,
    hero_title: str,
    hero_accent: str,
    hero_text: str,
) -> str:
    """
    Build a JOJO-styled invoice notification email.
    Uses table-based layout with inline styles for maximum email client compatibility.
    """

    company        = (invoice.get("company_name") or "JOJO").strip()
    brand_initial  = (company[:1] or "J").upper()
    department     = (invoice.get("department")    or "—").strip() or "—"
    vendor         = (invoice.get("vendor_name")   or "—").strip() or "—"
    invoice_number = (invoice.get("invoice_number") or "—").strip() or "—"

    total = invoice.get("total_amount")
    if total is not None:
        currency   = invoice.get("currency", "INR") or "INR"
        amount_str = f"{currency} {total}"
    else:
        amount_str = "—"

    footer_notice = (
        "This is an automated notification from JOJO Invoice Tracker. "
        "Please do not reply to this email."
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice Notification</title>
</head>

<!--
  ┌─────────────────────────────────────────────────────────────────────┐
  │  LAYOUT OVERVIEW                                                     │
  │  outer-wrap  600px centered, #f9fafb bg                             │
  │  ├── accent bar (4px gradient)                                      │
  │  ├── header  (logo + status badge)                                  │
  │  ├── hero    (icon + title + subtitle)                              │
  │  ├── details (amount highlight + 2×2 meta grid)                    │
  │  └── footer  (robot notice)                                         │
  └─────────────────────────────────────────────────────────────────────┘
-->

<body style="
  margin: 0;
  padding: 40px 16px;
  background-color: #f4f5f7;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  color: #1f2937;
  -webkit-font-smoothing: antialiased;
">

  <!-- ─── Outer wrapper ─────────────────────────────────────────── -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         width="100%" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td>

        <!-- Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               width="100%" style="
                 background: #ffffff;
                 border-radius: 16px;
                 border: 1px solid #e5e7eb;
                 overflow: hidden;
                 box-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.04);
               ">

          <!-- ── Accent bar ──────────────────────────────────────── -->
          <tr>
            <td style="
              height: 4px;
              background: linear-gradient(90deg, #F26E21 0%, #f5a05a 100%);
              font-size: 0;
              line-height: 0;
            ">&nbsp;</td>
          </tr>

          <!-- ── Header ─────────────────────────────────────────── -->
          <tr>
            <td style="
              padding: 22px 32px;
              border-bottom: 1px solid #f3f4f6;
            ">
              <table role="presentation" cellpadding="0" cellspacing="0"
                     border="0" width="100%">
                <tr>
                  <!-- Brand mark + name -->
                  <td style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0"
                           border="0">
                      <tr>
                        <!-- Avatar -->
                        <td style="
                          vertical-align: middle;
                          padding-right: 12px;
                        ">
                          <div style="
                            width: 40px;
                            height: 40px;
                            background: #F26E21;
                            border-radius: 10px;
                            text-align: center;
                            font-size: 18px;
                            font-weight: 700;
                            color: #ffffff;
                            letter-spacing: -0.5px;
                            line-height: 40px;
                          ">{brand_initial}</div>
                        </td>
                        <!-- Name + sub-label -->
                        <td style="vertical-align: middle;">
                          <div style="
                            font-size: 16px;
                            font-weight: 700;
                            color: #111827;
                            letter-spacing: -0.3px;
                            line-height: 1.1;
                          ">{company}</div>
                          <div style="
                            font-size: 11px;
                            color: #9ca3af;
                            letter-spacing: 0.3px;
                            margin-top: 3px;
                          ">JOJO Invoice Tracker</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Status badge (right-aligned) -->
                  <td style="vertical-align: middle; text-align: right;">
                    <span style="
                      display: inline-block;
                      background: rgba(242,110,33,0.08);
                      border: 1px solid rgba(242,110,33,0.30);
                      border-radius: 999px;
                      padding: 5px 13px;
                      font-size: 11.5px;
                      font-weight: 600;
                      color: #F26E21;
                      letter-spacing: 0.2px;
                      white-space: nowrap;
                    ">&#9679;&nbsp; {status_label}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Hero ───────────────────────────────────────────── -->
          <tr>
            <td style="
              padding: 30px 32px 26px;
              border-bottom: 1px solid #f3f4f6;
            ">
              <!-- Icon pill -->
              <div style="
                display: inline-block;
                width: 48px;
                height: 48px;
                background: rgba(242,110,33,0.08);
                border: 1px solid rgba(242,110,33,0.22);
                border-radius: 13px;
                text-align: center;
                font-size: 22px;
                line-height: 48px;
                margin-bottom: 16px;
              ">{hero_icon}</div>

              <!-- Heading -->
              <div style="
                font-size: 22px;
                font-weight: 700;
                color: #111827;
                letter-spacing: -0.4px;
                line-height: 1.25;
                margin-bottom: 8px;
              ">{hero_title} <span style="color: #F26E21;">{hero_accent}</span></div>

              <!-- Sub-text -->
              <div style="
                font-size: 14px;
                color: #6b7280;
                line-height: 1.65;
                max-width: 440px;
              ">{hero_text}</div>
            </td>
          </tr>

          <!-- ── Invoice details ────────────────────────────────── -->
          <tr>
            <td style="
              background: #fafafa;
              padding: 24px 32px 22px;
              border-bottom: 1px solid #f3f4f6;
            ">

              <!-- Section label -->
              <div style="
                font-size: 10px;
                letter-spacing: 1.2px;
                text-transform: uppercase;
                color: #9ca3af;
                font-weight: 600;
                margin-bottom: 14px;
              ">Invoice Details</div>

              <!-- Amount highlight row -->
              <table role="presentation" cellpadding="0" cellspacing="0"
                     border="0" width="100%"
                     style="margin-bottom: 10px;">
                <tr>
                  <td style="
                    background: #ffffff;
                    border: 1px solid rgba(242,110,33,0.28);
                    border-left: 3px solid #F26E21;
                    border-radius: 10px;
                    padding: 13px 18px;
                  ">
                    <table role="presentation" cellpadding="0" cellspacing="0"
                           border="0" width="100%">
                      <tr>
                        <td style="
                          font-size: 12px;
                          color: #6b7280;
                          font-weight: 500;
                          letter-spacing: 0.3px;
                          vertical-align: middle;
                        ">Total Amount</td>
                        <td style="
                          text-align: right;
                          font-size: 20px;
                          font-weight: 700;
                          color: #F26E21;
                          letter-spacing: -0.5px;
                          vertical-align: middle;
                        ">{amount_str}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 2 × 2 meta grid -->
              <table role="presentation" cellpadding="0" cellspacing="0"
                     border="0" width="100%">

                <!-- Row 1 : Invoice Number | Department -->
                <tr>
                  <td width="50%" style="padding: 0 5px 8px 0; vertical-align: top;">
                    <table role="presentation" cellpadding="0" cellspacing="0"
                           border="0" width="100%"
                           style="
                             background: #ffffff;
                             border: 1px solid #e5e7eb;
                             border-radius: 10px;
                           ">
                      <tr>
                        <td style="padding: 11px 14px;">
                          <div style="
                            font-size: 10px;
                            letter-spacing: 0.8px;
                            text-transform: uppercase;
                            color: #9ca3af;
                            font-weight: 500;
                            margin-bottom: 5px;
                          ">Invoice Number</div>
                          <div style="
                            font-size: 13px;
                            color: #111827;
                            font-weight: 500;
                            font-family: 'SFMono-Regular', Menlo, Monaco,
                                         Consolas, 'Liberation Mono',
                                         'Courier New', monospace;
                            word-break: break-all;
                          ">{invoice_number}</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <td width="50%" style="padding: 0 0 8px 5px; vertical-align: top;">
                    <table role="presentation" cellpadding="0" cellspacing="0"
                           border="0" width="100%"
                           style="
                             background: #ffffff;
                             border: 1px solid #e5e7eb;
                             border-radius: 10px;
                           ">
                      <tr>
                        <td style="padding: 11px 14px;">
                          <div style="
                            font-size: 10px;
                            letter-spacing: 0.8px;
                            text-transform: uppercase;
                            color: #9ca3af;
                            font-weight: 500;
                            margin-bottom: 5px;
                          ">Department</div>
                          <div style="
                            font-size: 13px;
                            color: #111827;
                            font-weight: 500;
                          ">{department}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Row 2 : Vendor | Company -->
                <tr>
                  <td width="50%" style="padding: 0 5px 0 0; vertical-align: top;">
                    <table role="presentation" cellpadding="0" cellspacing="0"
                           border="0" width="100%"
                           style="
                             background: #ffffff;
                             border: 1px solid #e5e7eb;
                             border-radius: 10px;
                           ">
                      <tr>
                        <td style="padding: 11px 14px;">
                          <div style="
                            font-size: 10px;
                            letter-spacing: 0.8px;
                            text-transform: uppercase;
                            color: #9ca3af;
                            font-weight: 500;
                            margin-bottom: 5px;
                          ">Vendor</div>
                          <div style="
                            font-size: 13px;
                            color: #111827;
                            font-weight: 500;
                          ">{vendor}</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <td width="50%" style="padding: 0 0 0 5px; vertical-align: top;">
                    <table role="presentation" cellpadding="0" cellspacing="0"
                           border="0" width="100%"
                           style="
                             background: #ffffff;
                             border: 1px solid #e5e7eb;
                             border-radius: 10px;
                           ">
                      <tr>
                        <td style="padding: 11px 14px;">
                          <div style="
                            font-size: 10px;
                            letter-spacing: 0.8px;
                            text-transform: uppercase;
                            color: #9ca3af;
                            font-weight: 500;
                            margin-bottom: 5px;
                          ">Company</div>
                          <div style="
                            font-size: 13px;
                            color: #111827;
                            font-weight: 500;
                          ">{company}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table><!-- /meta grid -->
            </td>
          </tr>

          <!-- ── Footer notice ──────────────────────────────────── -->
          <tr>
            <td style="
              background: #f9fafb;
              padding: 16px 32px;
            ">
              <table role="presentation" cellpadding="0" cellspacing="0"
                     border="0" width="100%">
                <tr>
                  <td style="
                    width: 20px;
                    vertical-align: top;
                    padding-right: 10px;
                    font-size: 14px;
                    opacity: 0.65;
                    padding-top: 1px;
                  ">🤖</td>
                  <td style="
                    font-size: 11.5px;
                    color: #9ca3af;
                    line-height: 1.6;
                    vertical-align: top;
                  ">{footer_notice}</td>
                </tr>
              </table>
            </td>
          </tr>

        </table><!-- /card -->
      </td>
    </tr>
  </table><!-- /outer wrapper -->

</body>
</html>"""


# ─── Recipient helpers ────────────────────────────────────────────────────────

async def _recipients_creator_and_department(
    created_by: Optional[str],
    department: Optional[str],
) -> list[str]:
    """Return deduplicated list of creator email + all emails in the invoice department."""
    emails: set[str] = set()
    if created_by:
        creator = await get_creator_email(created_by)
        if creator:
            emails.add(creator)
    if department:
        for e in await get_emails_by_department(department):
            emails.add(e)
    return list(emails)


# ─── Notification handlers ────────────────────────────────────────────────────

async def notify_invoice_created(invoice: dict[str, Any]) -> None:
    """Notify accounts department that a new invoice was created."""
    try:
        to = await get_emails_by_department("accounts")
        if not to:
            logger.debug("No accounts emails for invoice_created notification")
            return

        creator_name = invoice.get("created_by_name") or "an employee"
        dept         = invoice.get("department") or "—"

        subject   = f"New invoice created: {invoice.get('invoice_number') or 'Invoice'}"
        hero_text = (
            f"A new invoice has been created by {creator_name} "
            f"from the {dept} department. Please set Remarks and Priority and review it in JOJO Invoice Tracker."
        )
        body = _build_invoice_email(
            invoice,
            status_label="Created",
            hero_icon="🧾",
            hero_title="New invoice",
            hero_accent="submitted",
            hero_text=hero_text,
        )
        await send_email(to, subject, body)
    except Exception as e:
        logger.warning("notify_invoice_created failed: %s", e)


async def notify_invoice_approved(invoice: dict[str, Any]) -> None:
    """Notify invoice department employees and accounts department that admin approved for payment."""
    try:
        to_accounts = await get_emails_by_department("accounts")
        dept = (invoice.get("department") or "").strip()
        to_dept = await get_emails_by_department(dept) if dept else []
        to = list(dict.fromkeys(to_accounts + to_dept))
        if not to:
            logger.debug("No recipients for invoice_approved notification")
            return

        subject   = f"Invoice approved for release: {invoice.get('invoice_number') or 'Invoice'}"
        hero_text = (
            "This invoice has been approved for payment by the administrator. "
            "Accounts can now process payment in JOJO Invoice Tracker."
        )
        body = _build_invoice_email(
            invoice,
            status_label="Approved",
            hero_icon="✅",
            hero_title="Invoice",
            hero_accent="ready for release",
            hero_text=hero_text,
        )
        await send_email(to, subject, body)
    except Exception as e:
        logger.warning("notify_invoice_approved failed: %s", e)


async def notify_invoice_paid(invoice: dict[str, Any]) -> None:
    """Notify invoice department employees that the invoice has been marked paid by Accounts."""
    try:
        dept = (invoice.get("department") or "").strip()
        to = await get_emails_by_department(dept) if dept else []
        if not to:
            logger.debug("No recipients for invoice_paid notification (department=%r)", dept or None)
            return

        subject   = f"Invoice paid: {invoice.get('invoice_number') or 'Invoice'}"
        hero_text = (
            "This invoice has been marked as paid in JOJO Invoice Tracker. "
            "No further action is required unless adjustments are needed."
        )
        body = _build_invoice_email(
            invoice,
            status_label="Paid",
            hero_icon="💰",
            hero_title="Invoice",
            hero_accent="marked as paid",
            hero_text=hero_text,
        )
        await send_email(to, subject, body)
    except Exception as e:
        logger.warning("notify_invoice_paid failed: %s", e)


async def notify_invoice_on_hold_by_admin(invoice: dict[str, Any]) -> None:
    """Notify accounts + invoice department that the invoice is on hold by admin."""
    try:
        to_accounts = await get_emails_by_department("accounts")
        dept        = (invoice.get("department") or "").strip().lower()
        to_dept     = await get_emails_by_department(dept) if dept else []
        to          = list(dict.fromkeys(to_accounts + to_dept))
        if not to:
            logger.debug("No recipients for on_hold_by_admin notification")
            return

        subject   = f"Invoice on hold (admin): {invoice.get('invoice_number') or 'Invoice'}"
        hero_text = (
            "This invoice has been put on hold by the administrator. "
            "Please review the reason and coordinate with the appropriate department."
        )
        body = _build_invoice_email(
            invoice,
            status_label="On hold (admin)",
            hero_icon="⏸️",
            hero_title="Invoice",
            hero_accent="on hold",
            hero_text=hero_text,
        )
        logger.info(
            "on_hold_by_admin email body preview: %s...",
            body[:200].replace("\n", " "),
        )
        await send_email(to, subject, body)
    except Exception as e:
        logger.warning("notify_invoice_on_hold_by_admin failed: %s", e)


async def notify_invoice_on_hold_by_accounts(invoice: dict[str, Any]) -> None:
    """Notify creator and invoice department that the invoice is on hold by accounts."""
    try:
        to = await _recipients_creator_and_department(
            invoice.get("created_by"), invoice.get("department")
        )
        if not to:
            logger.debug("No recipients for on_hold_by_accounts notification")
            return

        subject   = f"Invoice on hold (accounts): {invoice.get('invoice_number') or 'Invoice'}"
        hero_text = (
            "This invoice has been put on hold by the accounts department. "
            "Please check the comments in JOJO Invoice Tracker and update the invoice if required."
        )
        body = _build_invoice_email(
            invoice,
            status_label="On hold (accounts)",
            hero_icon="⏸️",
            hero_title="Invoice",
            hero_accent="on hold",
            hero_text=hero_text,
        )
        await send_email(to, subject, body)
    except Exception as e:
        logger.warning("notify_invoice_on_hold_by_accounts failed: %s", e)


# ─── Scheduling helper ────────────────────────────────────────────────────────

def schedule_notification(coro) -> None:
    """Fire-and-forget: schedule a notification coroutine without blocking."""
    asyncio.create_task(coro)