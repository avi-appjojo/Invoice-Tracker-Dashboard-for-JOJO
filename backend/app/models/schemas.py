from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from enum import Enum


# ─── Enums ───────────────────────────────────────────────────────────

class PaymentStatus(str, Enum):
    UNPAID = "unpaid"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"


class InvoiceStatus(str, Enum):
    PENDING = "pending"
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"
    PAID = "paid"


class Priority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    CRITICAL = "critical"

class SheetStatus(str, Enum):
    PENDING = "Pending"
    APPROVED_FOR_RELEASE = "Approved for Release"
    PAID = "Paid"
    ON_HOLD = "On Hold"


# ─── Invoice Schemas ─────────────────────────────────────────────────

class InvoiceBase(BaseModel):
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_id: Optional[str] = None
    department: Optional[str] = None
    category: Optional[str] = None
    company_name: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    currency: str = "INR"
    payment_terms: Optional[str] = None
    description: Optional[str] = None
    # Sheets-style fields (new MongoDB flow)
    upload_date: Optional[date] = None
    sheet_status: Optional[SheetStatus] = None
    pay_cycle: Optional[str] = None  # "15" | "30" | "60" | "90"
    priority: Optional[Priority] = None
    # Accounts review flow: set by Accounts department only
    remarks: Optional[str] = None
    accounts_reviewed_at: Optional[str] = None  # ISO datetime; when set, visible to Admin and creator
    accounts_reviewed_by: Optional[str] = None  # User ID who performed the review


class AccountsReviewUpdate(BaseModel):
    """Body for POST /api/invoices/{id}/accounts-review. Only Accounts (or admin) can set these."""
    priority: Priority
    remarks: str = Field(..., min_length=1, description="Review remarks (required)")


class AccountsRejectBody(BaseModel):
    """Body for POST /api/invoices/{id}/accounts-reject. Puts invoice On Hold with optional remarks."""
    remarks: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    """Schema for creating an invoice (after PDF extraction or manual)."""
    pass


class InvoiceUpdate(BaseModel):
    """Schema for updating an invoice (superadmin only)."""
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_id: Optional[str] = None
    department: Optional[str] = None
    category: Optional[str] = None
    company_name: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    payment_terms: Optional[str] = None
    description: Optional[str] = None
    upload_date: Optional[date] = None
    sheet_status: Optional[SheetStatus] = None
    pay_cycle: Optional[str] = None
    priority: Optional[Priority] = None
    remarks: Optional[str] = None


class InvoiceResponse(InvoiceBase):
    id: str
    status: str
    payment_status: str
    priority: Optional[str] = None
    pdf_url: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    approved_at: Optional[str] = None
    approved_by: Optional[str] = None
    paid_at: Optional[str] = None
    paid_by: Optional[str] = None
    vendor: Optional[dict] = None  # Joined vendor data
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None
    on_hold_by: Optional[str] = None  # "admin" or "accounts" when sheet_status is On Hold
    remarks: Optional[str] = None
    accounts_reviewed_at: Optional[str] = None
    accounts_reviewed_by: Optional[str] = None


class InvoiceListResponse(BaseModel):
    data: list[InvoiceResponse]
    total: int
    page: int
    page_size: int


# ─── Vendor Schemas ──────────────────────────────────────────────────

class VendorBase(BaseModel):
    vendor_name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    currency: str = "INR"
    payment_terms: Optional[str] = None
    bank_details: Optional[str] = None
    category: Optional[str] = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    vendor_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None
    bank_details: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None


class VendorResponse(VendorBase):
    id: str
    status: str
    created_at: Optional[str] = None


# ─── Payment Schemas ─────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    """Only superadmin can create payments (mark as paid)."""
    invoice_id: str
    amount_paid: float
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    payment_date: Optional[date] = None
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    id: str
    invoice_id: str
    amount_paid: float
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    payment_date: Optional[str] = None
    notes: Optional[str] = None
    marked_by: Optional[str] = None
    created_at: Optional[str] = None


# ─── PDF Extraction Schema ───────────────────────────────────────────

class ExtractedInvoiceData(BaseModel):
    """Data extracted from an uploaded invoice PDF."""
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    currency: str = "INR"
    payment_terms: Optional[str] = None
    description: Optional[str] = None
    raw_text: Optional[str] = None  # Full extracted text for reference
    extraction_method: Optional[str] = None  # "text" | "tables" | "ocr" | None if failed


class AnalyzeResponse(BaseModel):
    """Response after analyzing (extracting) an invoice PDF — no DB storage."""
    extracted_data: ExtractedInvoiceData


class UploadResponse(BaseModel):
    """Response after uploading and storing an invoice PDF."""
    message: str
    invoice_id: str
    extracted_data: ExtractedInvoiceData
    pdf_url: str


# ─── Company Schemas ───────────────────────────────────────────────────


class CompanyBase(BaseModel):
    name: str
    display_name: Optional[str] = None
    is_active: bool = True


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class CompanyResponse(CompanyBase):
    id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ─── Dashboard Schemas ───────────────────────────────────────────────

class DashboardSummary(BaseModel):
    total_payables: float
    due_in_7_days: float
    overdue_amount: float
    paid_this_month: float
    total_invoices: int
    overdue_count: int
    pending_amount: float = 0.0
    pending_count: int = 0
    upcoming_7_days_count: int = 0
    high_priority_pending_count: int = 0
    approved_and_paid_count: int = 0


class AgingBucket(BaseModel):
    bucket: str  # "0-30", "31-60", "61-90", "90+"
    amount: float
    count: int


class PriorityBucket(BaseModel):
    priority: str  # "high", "medium", "low"
    amount: float
    count: int

class UpcomingPayment(BaseModel):
    id: str
    vendor_name: str
    invoice_number: Optional[str] = None
    total_amount: float
    currency: str = "INR"
    due_date: str
    days_left: int
    status: str


class OverdueAlert(BaseModel):
    id: str
    vendor_name: str
    invoice_number: Optional[str] = None
    total_amount: float
    currency: str = "INR"
    due_date: str
    days_overdue: int
    priority: str


class DashboardAllResponse(BaseModel):
    """Single response for dashboard: summary + aging + upcoming + overdue (one round-trip)."""
    summary: DashboardSummary
    aging: list[AgingBucket]
    priority_breakdown: list[PriorityBucket]
    upcoming: list[UpcomingPayment]
    overdue: list[OverdueAlert]


# ─── User Schemas ────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    status: str
    department: str
    created_at: Optional[str] = None


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role_name: str  # 'superadmin', 'admin', 'employee'
    department: str  # 'tech', 'marketing', 'sales', 'post_production', 'content', 'accounts', ...


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role_name: Optional[str] = None
    status: Optional[str] = None
     # Department changes should generally be admin-only and enforced at the router level.
    department: Optional[str] = None


# ─── Auth Schemas ────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
