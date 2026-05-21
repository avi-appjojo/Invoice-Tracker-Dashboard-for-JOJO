## JOJO Invoice Tracker – Backend Test Plan

This document specifies how to test the JOJO Invoice Tracker backend API. It is written for QA testers and assumes the backend is already running and connected to its databases and services.

---

## 1. High-Level Overview

- **Tech stack**: FastAPI, MongoDB (core data), Supabase Storage + Postgres (for PDF upload flow).
- **Local base URL**:
  - API root: `http://localhost:8000`
  - Swagger UI: `http://localhost:8000/docs`
- **Health check**:
  - **GET** `/health` → `200 OK` with body: `{"status": "healthy"}`

---

## 2. Environment & Configuration

The backend uses environment variables (see `.env.example`):

- **Server**
  - `HOST=0.0.0.0`
  - `PORT=8000`
- **MongoDB**
  - `MONGODB_URI` (e.g. `mongodb://localhost:27017`)
  - `MONGODB_DB_NAME=jojo_invoice_tracker`
- **Auth (JWT)**
  - `JWT_SECRET`
  - `JWT_ALGORITHM=HS256`
  - `ACCESS_TOKEN_EXPIRE_MINUTES=10080` (7 days)
- **Bootstrap admin**
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `BOOTSTRAP_ADMIN_PASSWORD`
- **Gmail / Google Chat**
  - `GMAIL_CLIENT_SECRET_PATH`
  - `GMAIL_TOKEN_PATH`
  - `GMAIL_SENDER_EMAIL`
  - `GOOGLE_CHAT_ENABLED` (set to `true` to enable Chat notifications)
  - `GOOGLE_CHAT_ADMIN_SPACE_ID` (space ID for the admin DM/space)
  - `GOOGLE_CHAT_BASE_INVOICE_URL` (optional, used to build invoice links in Chat)

**Tester prerequisites:**

- Backend server is running on the configured host/port.
- MongoDB is reachable with the configured `MONGODB_URI`.
- For PDF upload tests:
  - Supabase credentials are correctly configured.
  - Invoice storage bucket (e.g. `STORAGE_BUCKET_INVOICES`) exists and is public/readable.

**Google OAuth / Chat setup notes:**

- The same OAuth client and token file is reused for both **Gmail** and **Google Chat**:
  - Scopes requested: `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/chat.messages.create`
  - One-time setup script: `python -m scripts.gmail_oauth_setup` (from the `backend` directory).
- To obtain `GOOGLE_CHAT_ADMIN_SPACE_ID`:
  - Create a DM/space between the OAuth-connected Google account and the target admin in Google Chat.
  - Open the space in the browser and copy the space ID (it looks like `spaces/AAAA...`) from the URL.
  - Paste this value into `.env` as `GOOGLE_CHAT_ADMIN_SPACE_ID`.

---

## 3. Authentication, Users, and Roles

### 3.1 Login & JWT Token

- **Endpoint**: **POST** `/api/auth/login`
- **Request body (`LoginRequest`)**:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

- **Success response (200 – `LoginResponse`)**:

```json
{
  "access_token": "<JWT_TOKEN>",
  "token_type": "bearer",
  "user": {
    "id": "<user_id>",
    "name": "User Name",
    "email": "user@example.com",
    "role": "admin",
    "status": "active"
  }
}
```

#### 3.1.1 Bootstrap Admin Behaviour

On first-ever login with the configured `BOOTSTRAP_ADMIN_EMAIL`:

- If no user exists with that email:
  - Backend auto-creates a user:
    - `name = "Admin"`
    - `email = BOOTSTRAP_ADMIN_EMAIL`
    - `password_hash` = hash of `BOOTSTRAP_ADMIN_PASSWORD`
    - `role = "admin"`
    - `status = "active"`
- Then it proceeds to validate the provided password:
  - Valid email + correct password → 200 with `LoginResponse`.

**Tests:**

- [ ] Attempt login with `BOOTSTRAP_ADMIN_EMAIL` + correct `BOOTSTRAP_ADMIN_PASSWORD` on a clean DB.
- [ ] Verify a new admin user appears in Mongo (`users` collection).
- [ ] Verify returned `role` is `"admin"` and `status` is `"active"`.

#### 3.1.2 Negative Login Scenarios

- **Missing email or password**:
  - Request with either `email` or `password` empty.
  - Expect: **400** with `detail = "Email and password are required"`.
- **Invalid credentials**:
  - Wrong password or unknown email.
  - Expect: **401** with `detail = "Invalid credentials"`.
- **Inactive user**:
  - Manually set a user's `status` to something other than `"active"` in DB.
  - Try to log in.
  - Expect: **403** with `detail = "User account is inactive"`.

### 3.2 Using the Token

Protected endpoints require a Bearer token:

- **Header**: `Authorization: Bearer <access_token>`

**Negative tests:**

- No `Authorization` header → 401.
- Malformed token → 401 with `Authentication failed: ...` or `Invalid token payload`.
- Valid token whose user no longer exists → 403 `"User not found"`.
- Valid token for a user marked inactive → 403 `"User account is inactive"`.

### 3.3 Roles

Roles are strings stored on the user and in the JWT:

- `"superadmin"`
- `"admin"`
- `"employee"`

Role enforcement is via a `require_role(...)` mechanism:

- If `user.role` not in the allowed set:
  - **403** with a message like:  
    `"Access denied. Required role: superadmin, admin. Your role: employee"`

For each secured endpoint below, verify both:

- Authorized roles → 2xx.
- Unauthorized roles → 403.

---

## 4. Users API (`/api/users`)

### 4.1 Get Current User Profile

- **GET** `/api/users/me`
- **Auth**: Any authenticated user (Bearer token required).
- **Expected 200 response**:

```json
{
  "id": "<user_id>",
  "name": "User Name",
  "email": "user@example.com",
  "role": "employee",
  "status": "active"
}
```

**Tests:**

- [ ] Call with a valid token and verify returned user matches token.
- [ ] Call without token → 401.

### 4.2 List Users

- **GET** `/api/users`
- **Auth**: `role ∈ {superadmin, admin}`.
- **Response 200**:

```json
{
  "data": [
    {
      "id": "...",
      "name": "...",
      "email": "...",
      "role": "admin",
      "status": "active",
      "created_at": "..."
    }
  ]
}
```

**Tests:**

- [ ] As superadmin/admin → 200, list contains known users.
- [ ] As employee → 403.
- [ ] Verify no `password_hash` or sensitive fields are present.

### 4.3 Create User

- **POST** `/api/users`
- **Auth**: `role ∈ {superadmin, admin}`.
- **Body (`UserCreate`)**:

```json
{
  "name": "New User",
  "email": "new.user@example.com",
  "password": "StrongPassword123",
  "role_name": "employee"
}
```

- **Success 200**:

```json
{
  "message": "User created successfully",
  "user": {
    "id": "<uuid>",
    "name": "New User",
    "email": "new.user@example.com",
    "role": "employee",
    "status": "active"
  }
}
```

**Negative tests:**

- [ ] Duplicate email → 400 `"Email already exists"`.
- [ ] Invalid `role_name` (e.g. `"manager"`) → 400 `"Invalid role"`.
- [ ] Employee attempting create → 403.

### 4.4 Update User

- **PUT** `/api/users/{user_id}`
- **Auth**: `role ∈ {superadmin, admin}`.
- **Body (`UserUpdate`)**: at least one field required.

```json
{
  "name": "Updated Name",
  "role_name": "admin",
  "status": "inactive"
}
```

- **Success 200**:

```json
{ "message": "User updated successfully" }
```

**Negative tests:**

- [ ] Nonexistent `user_id` → 404 `"User not found"`.
- [ ] Empty body → 400 `"No fields to update"`.
- [ ] Invalid `role_name` → 400 `"Invalid role"`.
- [ ] Employee attempting update → 403.

---

## 5. Invoices API (`/api/invoices`)

### 5.1 List Invoices

- **GET** `/api/invoices`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Query parameters (key ones)**:
  - `page` (default 1, ≥1)
  - `page_size` (default 20, 1–100)
  - `status` (optional, one of `paid|overdue|due_soon|pending`) – **computed** filter.
  - `payment_status` (e.g. `"paid"` or `"unpaid"`).
  - `department`, `sheet_status`, `company_name`, `vendor`.
  - `search` – applied to `invoice_number` and `vendor_name` (case-insensitive).
  - `priority` – must match `low|medium|high|critical`.
  - `sort_by` – one of `created_at|due_date|total_amount|status`.
  - `sort_order` – `"asc"` or `"desc"`.

**Soft delete rule**:

- Results exclude any invoice where `deleted_at` is set and non-null.

**Response 200 (`InvoiceListResponse`)**:

```json
{
  "data": [
    {
      "id": "...",
      "invoice_number": "...",
      "vendor_name": "...",
      "company_name": "...",
      "department": "...",
      "description": "...",
      "total_amount": 1234.56,
      "due_date": "2025-01-31",
      "status": "Pending",
      "payment_status": "unpaid",
      "priority": "high",
      "created_at": "...",
      "updated_at": "...",
      "approved_at": null,
      "approved_by": null,
      "paid_at": null,
      "paid_by": null,
      "upload_date": "2024-12-15",
      "sheet_status": "Pending",
      "pay_cycle": "30"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

**Tests:**

- [ ] Basic listing (no filters) returns expected set.
- [ ] Search by substring in `vendor_name` or `invoice_number`.
- [ ] Filter by `payment_status`, `sheet_status`, `company_name`, `vendor`, `priority`.
- [ ] Filter by `status=overdue`/`due_soon`/`pending` – ensure **computed** status matches.
- [ ] Pagination: `page` and `page_size` behave correctly.
- [ ] Soft-deleted invoices never appear here.

### 5.2 Get Single Invoice

- **GET** `/api/invoices/{invoice_id}`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Response 200**: `InvoiceResponse` with:
  - Derived `status` (from due date & payment_status if `sheet_status` absent).
  - Derived `priority`.

**Negative tests:**

- [ ] Nonexistent or deleted invoice → 404 `"Invoice not found"`.

### 5.3 Create Invoice

- **POST** `/api/invoices`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Body (`InvoiceCreate`)** – all fields optional:

```json
{
  "invoice_number": "INV-1001",
  "vendor_name": "Test Vendor",
  "company_name": "JOJO",
  "department": "Finance",
  "invoice_date": "2025-01-01",
  "due_date": "2025-01-31",
  "total_amount": 1000.0,
  "currency": "INR",
  "upload_date": "2025-01-01",
  "sheet_status": "Pending",
  "priority": "medium"
}
```

**Behaviour:**

- If `sheet_status` missing → defaults to `"Pending"`.
- If `upload_date` missing → defaults to today.
- `payment_status` is derived:
  - `"paid"` if `sheet_status == "Paid"`.
  - `"unpaid"` otherwise.
- Sets:
  - `_id` = UUID.
  - `created_by` = current user id.
  - `created_at`, `updated_at` = now.

**Tests:**

- [ ] Create with minimal fields – verify defaults.
- [ ] Create with explicit `sheet_status = "Paid"` – verify `payment_status = "paid"`.
- [ ] When `GOOGLE_CHAT_ENABLED=true` and `GOOGLE_CHAT_ADMIN_SPACE_ID` is configured:
  - A Google Chat DM is received by the admin space containing invoice number, amount, department, creator, created_at, due_date, and (if configured) an invoice link.
  - If `GOOGLE_CHAT_ADMIN_SPACE_ID` is invalid, invoice creation still succeeds but backend logs contain a non-fatal warning about Chat send failure after retries.

### 5.4 Update Invoice

- **PUT** `/api/invoices/{invoice_id}`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Body (`InvoiceUpdate`)** – optional fields, at least one required.

**Behaviour:**

- Valid for invoices including those already soft-deleted (it checks with `include_deleted=True`).
- If invoice not found → 404 `"Invoice not found"`.
- If no fields to update → 400 `"No fields to update"`.
- Sets `updated_at = now`.
- Returns updated invoice via `get_invoice`.

**Tests:**

- [ ] Valid update (change `due_date`, `total_amount`, etc.) → 200.
- [ ] Nonexistent `invoice_id` → 404.
- [ ] Empty body → 400.

### 5.5 Hard Delete Invoice (Superadmin Only)

- **DELETE** `/api/invoices/{invoice_id}`
- **Auth**: `role = "superadmin"`.
- **Behaviour**:
  - Deletes invoice from Mongo.
- **Success 200**:

```json
{ "message": "Invoice deleted successfully" }
```

**Tests:**

- [ ] As superadmin: delete invoice; subsequent GET → 404.
- [ ] As admin/employee: attempt delete → 403.

### 5.6 Approve All by Company & Vendor

- **POST** `/api/invoices/approve-all`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Body**:

```json
{
  "company_name": "JOJO",
  "vendor_name": "Test Vendor"
}
```

**Behaviour:**

- Builds case-insensitive **exact** matches on `company_name` and `vendor_name`.
- Targets invoices where:
  - `sheet_status != "Paid"`.
  - Not soft-deleted.
- Updates matched invoices:
  - `sheet_status = "Approved for Release"`.
  - `priority = "high"`.
  - `approved_at = now`.
  - `approved_by = current_user.id`.
  - `updated_at = now`.

- **Success 200**:

```json
{
  "message": "Invoices approved for release",
  "updated_count": 3
}
```

**Negative tests:**

- [ ] Missing `company_name` or `vendor_name` → 400 `"company_name and vendor_name required"`.

### 5.7 Proceed Single Invoice (Pending → Approved for Release)

- **POST** `/api/invoices/{invoice_id}/proceed`
- **Auth**: `role ∈ {superadmin, admin}`.

**Behaviour:**

- If invoice not found → 404 `"Invoice not found"`.
- If current `sheet_status != "Pending"` → 400 `"Only Pending invoices can be proceeded"`.
- On success:
  - `sheet_status = "Approved for Release"`.
  - `priority = "high"`.
  - `approved_at = now`.
  - `approved_by = current_user.id`.
  - `updated_at = now`.

- **Success 200**:

```json
{ "message": "Invoice approved for release" }
```

### 5.8 Toggle On Hold

- **POST** `/api/invoices/{invoice_id}/hold`
- **Auth**: `role ∈ {superadmin, admin, employee}`.

**Behaviour:**

- If invoice not found → 404.
- If `sheet_status == "Paid"` → 400 `"Paid invoices cannot be put on hold"`.
- If `sheet_status == "On Hold"` → toggles back to `"Pending"`.
- Otherwise toggles to `"On Hold"`.
- Always sets `updated_at = now`.

- **Success 200**:

```json
{ "message": "Invoice status set to Pending" }
```

or

```json
{ "message": "Invoice status set to On Hold" }
```

### 5.9 Mark Invoice as Paid (Simple Flow)

- **POST** `/api/invoices/{invoice_id}/mark-paid`
- **Auth**: `role = "employee"` only.

**Preconditions:**

- Invoice exists and is not already `"Paid"`.
- `sheet_status == "Approved for Release"`.

**Behaviour:**

- Not found → 404 `"Invoice not found"`.
- If already `sheet_status == "Paid"` → 400 `"Invoice is already marked as Paid"`.
- If `sheet_status != "Approved for Release"` → 400 `"Invoice must be Approved for Release to mark as Paid"`.
- On success:
  - `sheet_status = "Paid"`.
  - `payment_status = "paid"`.
  - `updated_at = now`.

- **Success 200**:

```json
{ "message": "Invoice marked as paid" }
```

### 5.10 Soft Delete Invoice

- **POST** `/api/invoices/{invoice_id}/soft-delete`
- **Auth**: `role ∈ {superadmin, admin, employee}`.

**Behaviour:**

- Works even if invoice already soft-deleted; will reapply fields.
- If invoice not found (neither active nor deleted) → 404 `"Invoice not found"`.
- Sets:
  - `deleted_at = now`.
  - `deleted_by = current_user.id`.
  - `updated_at = now`.

- **Success 200**:

```json
{ "message": "Invoice soft deleted successfully" }
```

**Tests:**

- [ ] After soft delete, invoice no longer appears in `/api/invoices` list or dashboard data.
- [ ] Direct GET by id (if still present) reflects `deleted_at` and `deleted_by`.

---

## 6. Payments API (`/api/payments`) – Mongo Flow

### 6.1 Create Payment

- **POST** `/api/payments`
- **Auth**: `role = "employee"` only.
- **Body (`PaymentCreate`)**:

```json
{
  "invoice_id": "<invoice_id>",
  "amount_paid": 1000.0,
  "payment_method": "NEFT",
  "reference_number": "TXN123",
  "payment_date": "2025-02-01",
  "notes": "First payment"
}
```

**Behaviour:**

- Looks up invoice by `_id` or ObjectId:
  - Not found → 404 `"Invoice not found"`.
- Checks `sheet_status`:
  - Must be `"Approved for Release"`, otherwise 400 `"Invoice must be Approved for Release"`.
- Creates payment with:
  - `_id = UUID`, `invoice_id`, `amount_paid`, `payment_method`, `reference_number`, `payment_date` (string), `notes`, `marked_by = user.id`, `created_at = now`.
- Updates invoice:
  - `sheet_status = "Paid"`.
  - `payment_status = "paid"`.
  - `paid_at = now`.
  - `paid_by = user.id`.
  - `updated_at = now`.

- **Success 200**:

```json
{
  "message": "Payment recorded and invoice marked as paid",
  "payment_id": "<uuid>"
}
```

### 6.2 Get Payments for an Invoice

- **GET** `/api/payments/{invoice_id}`
- **Auth**: `role ∈ {superadmin, admin, employee}`.

**Behaviour:**

- First validates that the invoice exists:
  - Not found → 404 `"Invoice not found"`.
- Fetches payments for that invoice, sorted by `created_at` descending.
- Converts each `_id` to `id` in response.

- **Success 200**:

```json
{
  "data": [
    {
      "id": "<payment_id>",
      "invoice_id": "<invoice_id>",
      "amount_paid": 1000.0,
      "payment_method": "NEFT",
      "reference_number": "TXN123",
      "payment_date": "2025-02-01",
      "notes": "First payment",
      "marked_by": "<user_id>",
      "created_at": "..."
    }
  ]
}
```

**Tests:**

- [ ] After creating one or more payments, ensure they are returned in correct order.
- [ ] Unauthorized (no token) → 401; invalid role is not applicable here (all roles allowed).

---

## 7. Companies API (`/api/companies`)

### 7.1 List Companies (Bootstrap Behaviour)

- **GET** `/api/companies`
- **Auth**: `role ∈ {superadmin, admin, employee}`.

**Bootstrap behaviour:**

- If `companies` collection is empty:
  - Reads distinct `company_name` values from `invoices` collection.
  - Seeds new documents:
    - `_id` = UUID.
    - `name` and `display_name` from each distinct company name.
    - `is_active = true`.
    - `created_by = null`.
    - `created_at`, `updated_at = now`.

- **Success 200**: array of `CompanyResponse`:

```json
[
  {
    "id": "<company_id>",
    "name": "JOJO",
    "display_name": "JOJO",
    "is_active": true,
    "created_by": null,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

**Tests:**

- [ ] On a fresh DB with invoices but no companies, verify initial call seeds companies correctly.
- [ ] Subsequent calls do not create duplicates.

### 7.2 Create Company

- **POST** `/api/companies`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Body (`CompanyCreate`)**:

```json
{
  "name": "Navkar",
  "display_name": "Navkar Logistics",
  "is_active": true
}
```

**Behaviour:**

- Creates document:
  - `_id = UUID`.
  - `created_by = current_user.id`.
  - `created_at`, `updated_at = now`.

- **Success 200**: created `CompanyResponse`.

### 7.3 Update Company

- **PUT** `/api/companies/{company_id}`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Body (`CompanyUpdate`)** – optional fields; at least one required.

**Behaviour:**

- Not found → 404 `"Company not found"`.
- Employee restriction:
  - If `user.role == "employee"` and `existing.created_by != user.id` → 403 `"Access denied"`.
- Empty update body → 400 `"No fields to update"`.
- On success:
  - Updates fields.
  - Sets `updated_at = now`.
  - Returns updated `CompanyResponse`.

### 7.4 Delete Company

- **DELETE** `/api/companies/{company_id}`
- **Auth**: `role ∈ {superadmin, admin, employee}`.

**Behaviour:**

- Not found → 404 `"Company not found"`.
- Employee restriction:
  - If `user.role == "employee"` and `existing.created_by != user.id` → 403 `"Access denied"`.
- Otherwise deletes the company.

- **Success 200**:

```json
{ "message": "Company deleted successfully" }
```

---

## 8. Vendors API (`/api/vendors`)

### 8.1 List Vendors (Bootstrap Behaviour)

- **GET** `/api/vendors`
- **Auth**: `role ∈ {superadmin, admin, employee}`.

**Bootstrap behaviour:**

- If `vendors` collection is empty:
  - Reads distinct `vendor_name` values from `invoices`.
  - Seeds vendor docs:
    - `_id = UUID`.
    - `vendor_name`.
    - `status = "active"`.
    - `created_at = now`.

- **Success 200**:

```json
{
  "data": [
    {
      "id": "<vendor_id>",
      "vendor_name": "Test Vendor",
      "contact_person": null,
      "email": null,
      "phone": null,
      "gst_number": null,
      "category": null,
      "status": "active"
    }
  ]
}
```

### 8.2 Create Vendor

- **POST** `/api/vendors`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Body (`VendorCreate`)**:

```json
{
  "vendor_name": "New Vendor",
  "contact_person": "Alice",
  "email": "alice@vendor.com",
  "phone": "1234567890",
  "gst_number": "GST123",
  "category": "IT Services"
}
```

**Behaviour:**

- Creates doc:
  - `_id = UUID`.
  - `status = "active"`.
  - `created_at = now`.

- **Success 200**: `VendorResponse`.

### 8.3 Get Vendor

- **GET** `/api/vendors/{vendor_id}`
- **Auth**: `role ∈ {superadmin, admin, employee}`.

**Behaviour:**

- Not found → 404 `"Vendor not found"`.
- Otherwise returns `VendorResponse`.

### 8.4 Update Vendor

- **PUT** `/api/vendors/{vendor_id}`
- **Auth**: `role ∈ {superadmin, admin, employee}`.
- **Body (`VendorUpdate`)** – optional fields; at least one required.

**Behaviour:**

- Not found → 404 `"Vendor not found"`.
- Empty payload → 400 `"No fields to update"`.
- Updates vendor and returns updated `VendorResponse`.

---

## 9. Dashboard API (`/api/dashboard`)

All dashboard endpoints require:

- **Auth**: `role ∈ {superadmin, admin}`.

They operate over invoices, ignoring soft-deleted ones.

### 9.1 Summary

- **GET** `/api/dashboard/summary`
- **Response 200 (`DashboardSummary`)**:

```json
{
  "total_payables": 100000.0,
  "due_in_7_days": 20000.0,
  "overdue_amount": 15000.0,
  "paid_this_month": 30000.0,
  "total_invoices": 50,
  "overdue_count": 5,
  "pending_amount": 40000.0,
  "pending_count": 20,
  "upcoming_7_days_count": 7,
  "high_priority_pending_count": 3
}
```

**Key points to validate:**

- `total_payables`: sum of `total_amount` of invoices with `payment_status != "paid"`.
- `overdue_amount` & `overdue_count`: invoices with computed status `"overdue"`.
- `pending_*`: invoices with computed status `"pending"`.
- `due_in_7_days` and `upcoming_7_days_count`: due within next 7 days and unpaid.
- `paid_this_month`: sum of `total_amount` for paid invoices whose `paid_at` falls in the current month.

### 9.2 Aging

- **GET** `/api/dashboard/aging`

**Behaviour:**

- Uses invoices where:
  - `payment_status != "paid"`.
  - Not soft-deleted.
- Buckets by days until due (`0-30`, `31-60`, `61-90`, `90+`).

- **Response 200**:

```json
{
  "data": [
    { "bucket": "0-30", "amount": 10000.0, "count": 5 },
    { "bucket": "31-60", "amount": 8000.0, "count": 3 },
    { "bucket": "61-90", "amount": 0.0, "count": 0 },
    { "bucket": "90+", "amount": 2000.0, "count": 1 }
  ]
}
```

### 9.3 Upcoming Payments

- **GET** `/api/dashboard/upcoming-payments`

**Behaviour:**

- Considers invoices with `payment_status != "paid"` and not soft-deleted.
- Uses computed status.
- Only includes invoices where `status == "due_soon"`.

- **Response 200**:

```json
{
  "data": [
    {
      "id": "<invoice_id>",
      "vendor_name": "Test Vendor",
      "invoice_number": "INV-1001",
      "total_amount": 1000.0,
      "due_date": "2025-01-31",
      "days_left": 5,
      "status": "due_soon"
    }
  ]
}
```

### 9.4 Overdue Alerts

- **GET** `/api/dashboard/overdue-alerts`

**Behaviour:**

- Considers invoices with `payment_status != "paid"` and not soft-deleted.
- Only includes invoices where computed status is `"overdue"`.
- `days_overdue` is absolute number of days past due.
- `priority` is computed using invoice logic.

- **Response 200**:

```json
{
  "data": [
    {
      "id": "<invoice_id>",
      "vendor_name": "Test Vendor",
      "invoice_number": "INV-9999",
      "total_amount": 2000.0,
      "due_date": "2024-12-01",
      "days_overdue": 60,
      "priority": "high"
    }
  ]
}
```

### 9.5 Combined Dashboard

- **GET** `/api/dashboard/all`

**Behaviour:**

- Single DB round-trip returning:
  - `summary` (`DashboardSummary`).
  - `aging` (`AgingBucket[]`).
  - `upcoming` (`UpcomingPayment[]`).
  - `overdue` (`OverdueAlert[]`).
- Internally uses similar logic to the previous endpoints.

**Response 200** example:

```json
{
  "summary": { ... },
  "aging": [ ... ],
  "upcoming": [ ... ],
  "overdue": [ ... ]
}
```

**Tests:**

- [ ] Compare `/dashboard/all` pieces to individual `/summary`, `/aging`, `/upcoming-payments`, `/overdue-alerts` for consistency.

---

## 10. Upload & PDF Extraction API (`/api/upload`)

All these endpoints require:

- **Auth**: Any authenticated user (`superadmin`, `admin`, or `employee`).

### 10.1 Analyze Invoice (No DB Writes)

- **POST** `/api/upload/analyze`
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `file`: PDF file (required).

**Validation:**

- Content type must be allowed (PDF-based); if not:
  - 400 with message like: `"Only PDF files are allowed. Got: <content_type>"`.
- File size must be ≤ `MAX_UPLOAD_SIZE_MB` from settings.
  - If exceeded: 400 with `"File too large. Max size: <X>MB"`.

**Behaviour:**

- Reads file bytes and calls `extract_invoice_data(file_bytes)`.
- On success returns:

```json
{
  "extracted_data": {
    "invoice_number": "...",
    "vendor_name": "...",
    "invoice_date": "...",
    "due_date": "...",
    "amount": 1000.0,
    "tax_amount": 180.0,
    "total_amount": 1180.0,
    "currency": "INR",
    "payment_terms": "Net 30",
    "description": "Some description",
    "raw_text": "...",
    "extraction_method": "text"
  }
}
```

**Negative tests:**

- Non-PDF file → 400.
- Oversized file → 400.
- Internal extraction failure (simulate with corrupted PDF) → 500 with `"Analysis failed: ..."` and stack trace.

### 10.2 Upload Invoice (PDF + Supabase)

- **POST** `/api/upload/invoice`
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `file`: PDF file (required).
  - `extracted_data`: JSON string (`ExtractedInvoiceData`), optional.

**Behaviour:**

1. Validates PDF type and size.
2. Determines `extracted` data:
   - If `extracted_data` provided:
     - Parses JSON into `ExtractedInvoiceData`.
   - Else:
     - Calls `extract_invoice_data(file_bytes)`.
3. Uploads file to Supabase Storage (`STORAGE_BUCKET_INVOICES`):
   - Path `invoices/<uuid>/<original_filename>`.
   - If bucket missing or ACL invalid → 500 with message referencing bucket.
4. Obtains `pdf_url` via `get_public_url`.
5. Computes:
   - `status = derive_invoice_status(extracted.due_date, "unpaid")`.
   - `priority = calculate_priority(extracted.due_date, null, "unpaid")`.
6. Inserts row into Supabase `invoices` table with invoice data.
7. If insert result has no data → 500 `"Failed to create invoice record"`.
8. Inserts record in `invoice_attachments`.
9. Inserts audit log in `audit_logs`.

**Success 200** (`UploadResponse`):

```json
{
  "message": "Invoice uploaded and data extracted successfully",
  "invoice_id": "<supabase_invoice_id>",
  "extracted_data": { ... },
  "pdf_url": "https://..."
}
```

**Negative tests:**

- Invalid/missing `file` → 400.
- Invalid JSON in `extracted_data` → 500 (JSON parsing / validation error).
- Supabase storage/DB issues → 500 with explicit error messages.

---

## 11. End-to-End Scenario Suggestions

To validate the whole flow, run these end-to-end scenarios:

1. **Setup & Auth**
   - [ ] Start backend; ensure `/health` returns `{"status": "healthy"}`.
   - [ ] Use `BOOTSTRAP_ADMIN_EMAIL` to login once and create admin.
   - [ ] Create additional users: one admin, one employee.

2. **Core Invoice Lifecycle (Mongo)**
   - [ ] As admin, create vendors and companies.
   - [ ] As employee, create several invoices (Pending).
   - [ ] Verify they appear in `/api/invoices` and dashboard summary.
   - [ ] As admin, use `/api/invoices/{id}/proceed` to move an invoice to "Approved for Release".
   - [ ] As employee, use `/api/payments` to mark it paid and verify:
     - Invoice `sheet_status = "Paid"`, `payment_status = "paid"`.
     - Dashboard updates reflect payment.

3. **Bulk Approval**
   - [ ] Create multiple Pending invoices for same company+vendor.
   - [ ] Call `/api/invoices/approve-all` with that company+vendor.
   - [ ] Check `updated_count` and verify all matching invoices are "Approved for Release" and `priority="high"`.

4. **On Hold & Soft Delete**
   - [ ] Use `/api/invoices/{id}/hold` to toggle an invoice between "Pending" and "On Hold".
   - [ ] Attempt to put a Paid invoice on hold → expect 400.
   - [ ] Soft delete an invoice and verify it disappears from lists and dashboard.

5. **Dashboard Consistency**
   - [ ] Compare results from `/dashboard/summary`, `/dashboard/aging`, `/dashboard/upcoming-payments`, `/dashboard/overdue-alerts` with `/dashboard/all`.
   - [ ] Confirm numbers are consistent given the known dataset.

6. **Upload + Supabase Flow**
   - [ ] As employee, call `/api/upload/analyze` with a valid invoice PDF.
   - [ ] Review `extracted_data`; adjust if needed on client side.
   - [ ] Call `/api/upload/invoice` with the same file + `extracted_data` JSON.
   - [ ] Confirm new record exists in Supabase `invoices` table and attachment/audit logs are created.

This test plan should give comprehensive coverage of the backend behaviour for the JOJO Invoice Tracker system, including positive flows, role-based access control, data integrity, and error handling.

