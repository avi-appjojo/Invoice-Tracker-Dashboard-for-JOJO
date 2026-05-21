"""
Vendors Router — CRUD operations for vendors (Mongo-backed).
Shared by admins and employees.
"""

from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth.middleware import CurrentUser, require_role
from app.database import get_db
from app.models.schemas import VendorCreate, VendorUpdate, VendorResponse


router = APIRouter(prefix="/api/vendors", tags=["Vendors"])


@router.get("")
async def list_vendors(
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """
    List all vendors.

    On first run (when the vendors collection is empty), bootstrap from distinct
    vendor_name values in the invoices collection so existing vendors appear.
    """
    db = get_db()
    docs = await db["vendors"].find({}).sort("vendor_name", 1).to_list(length=10_000)

    if not docs:
        names = await db["invoices"].distinct("vendor_name")
        now = datetime.now(timezone.utc).isoformat()
        seed_docs = []
        for raw_name in names or []:
            if not raw_name:
                continue
            name = str(raw_name).strip()
            if not name:
                continue
            seed_docs.append(
                {
                    "_id": str(uuid.uuid4()),
                    "vendor_name": name,
                    "status": "active",
                    "created_at": now,
                }
            )
        if seed_docs:
            await db["vendors"].insert_many(seed_docs)
            docs = await db["vendors"].find({}).sort("vendor_name", 1).to_list(
                length=10_000
            )

    items = []
    for v in docs:
        items.append(
            {
                "id": str(v.get("_id")),
                "vendor_name": v.get("vendor_name"),
                "contact_person": v.get("contact_person"),
                "email": v.get("email"),
                "phone": v.get("phone"),
                "gst_number": v.get("gst_number"),
                "category": v.get("category"),
                "status": v.get("status", "active"),
            }
        )
    return {"data": items}


@router.post("", response_model=VendorResponse)
async def create_vendor(
    vendor: VendorCreate,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Create a new vendor in Mongo. Only Accounts department (or admins/superadmins) can create."""
    db = get_db()
    # Only Accounts department employees or admins/superadmins can create vendors
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can create vendors",
        )

    now = datetime.now(timezone.utc).isoformat()
    vendor_id = str(uuid.uuid4())
    doc = vendor.model_dump()
    doc.update(
        {
            "_id": vendor_id,
            "status": "active",
            "created_at": now,
        }
    )
    await db["vendors"].insert_one(doc)

    return VendorResponse(
        id=vendor_id,
        vendor_name=doc["vendor_name"],
        contact_person=doc.get("contact_person"),
        email=doc.get("email"),
        phone=doc.get("phone"),
        gst_number=doc.get("gst_number"),
        category=doc.get("category"),
        status=doc.get("status", "active"),
        created_at=doc.get("created_at"),
    )


@router.get("/{vendor_id}", response_model=VendorResponse)
async def get_vendor(
    vendor_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Get a single vendor from Mongo."""
    db = get_db()
    v = await db["vendors"].find_one({"_id": vendor_id})
    if not v:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return VendorResponse(
        id=str(v.get("_id")),
        vendor_name=v.get("vendor_name"),
        contact_person=v.get("contact_person"),
        email=v.get("email"),
        phone=v.get("phone"),
        gst_number=v.get("gst_number"),
        category=v.get("category"),
        status=v.get("status", "active"),
        created_at=v.get("created_at"),
    )


@router.put("/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: str,
    vendor_update: VendorUpdate,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Update a vendor in Mongo."""
    db = get_db()
    existing = await db["vendors"].find_one({"_id": vendor_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Only Accounts department employees or admins/superadmins can update vendors
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can update vendors",
        )

    update_data = vendor_update.model_dump(exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db["vendors"].update_one({"_id": vendor_id}, {"$set": update_data})
    updated = await db["vendors"].find_one({"_id": vendor_id})

    return VendorResponse(
        id=str(updated.get("_id")),
        vendor_name=updated.get("vendor_name"),
        contact_person=updated.get("contact_person"),
        email=updated.get("email"),
        phone=updated.get("phone"),
        gst_number=updated.get("gst_number"),
        category=updated.get("category"),
        status=updated.get("status", "active"),
        created_at=updated.get("created_at"),
    )
