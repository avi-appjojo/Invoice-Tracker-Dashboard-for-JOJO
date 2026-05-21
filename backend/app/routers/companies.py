"""
Companies Router — CRUD operations for companies (Mongo-backed).
Employees can manage their own companies; admins/superadmins can manage all.
"""

from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth.middleware import CurrentUser, require_role
from app.database import get_db
from app.models.schemas import CompanyCreate, CompanyUpdate, CompanyResponse


router = APIRouter(prefix="/api/companies", tags=["Companies"])


@router.get("", response_model=list[CompanyResponse])
async def list_companies(
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """
    List all companies.

    On first run (when the companies collection is empty), bootstrap records
    from distinct company_name values in the invoices collection so that
    existing invoice companies (e.g. JOJO, Navkar) appear automatically.
    """
    db = get_db()
    docs = await db["companies"].find({}).sort("name", 1).to_list(length=10_000)

    # Bootstrap from invoices if there are no explicit companies yet.
    if not docs:
        names = await db["invoices"].distinct("company_name")
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
                    "name": name,
                    "display_name": name,
                    "is_active": True,
                    "created_by": None,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        if seed_docs:
            await db["companies"].insert_many(seed_docs)
            docs = await db["companies"].find({}).sort("name", 1).to_list(length=10_000)

    companies: list[CompanyResponse] = []
    for c in docs:
        companies.append(
            CompanyResponse(
                id=str(c.get("_id")),
                name=c.get("name"),
                display_name=c.get("display_name"),
                is_active=bool(c.get("is_active", True)),
                created_by=c.get("created_by"),
                created_at=c.get("created_at"),
                updated_at=c.get("updated_at"),
            )
        )
    return companies


@router.post("", response_model=CompanyResponse)
async def create_company(
    company: CompanyCreate,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Create a new company. Only Accounts department (or admins/superadmins) can create."""
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    # Only Accounts department employees or admins/superadmins can create companies
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can create companies",
        )

    company_id = str(uuid.uuid4())
    doc = company.model_dump()
    doc.update(
        {
            "_id": company_id,
            "created_by": user.user_db_id,
            "created_at": now,
            "updated_at": now,
        }
    )
    await db["companies"].insert_one(doc)
    return CompanyResponse(
        id=company_id,
        name=doc["name"],
        display_name=doc.get("display_name"),
        is_active=bool(doc.get("is_active", True)),
        created_by=doc.get("created_by"),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: str,
    company_update: CompanyUpdate,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Update an existing company."""
    db = get_db()
    existing = await db["companies"].find_one({"_id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Company not found")

    # Only Accounts department employees or admins/superadmins can update companies
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can update companies",
        )

    # For non-Accounts employees (if ever allowed), ensure they only update their own companies.
    if user.role == "employee" and user.department != "accounts":
        if existing.get("created_by") != user.user_db_id:
            raise HTTPException(status_code=403, detail="Access denied")

    update_data = company_update.model_dump(exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db["companies"].update_one({"_id": company_id}, {"$set": update_data})

    updated = await db["companies"].find_one({"_id": company_id})
    return CompanyResponse(
        id=str(updated.get("_id")),
        name=updated.get("name"),
        display_name=updated.get("display_name"),
        is_active=bool(updated.get("is_active", True)),
        created_by=updated.get("created_by"),
        created_at=updated.get("created_at"),
        updated_at=updated.get("updated_at"),
    )


@router.delete("/{company_id}")
async def delete_company(
    company_id: str,
    user: CurrentUser = Depends(require_role("superadmin", "admin", "employee")),
):
    """Delete a company."""
    db = get_db()
    existing = await db["companies"].find_one({"_id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Company not found")

    # Only Accounts department employees or admins/superadmins can delete companies
    if user.role not in ("admin", "superadmin") and user.department != "accounts":
        raise HTTPException(
            status_code=403,
            detail="Only Accounts department or admins can delete companies",
        )

    # For non-Accounts employees (if ever allowed), ensure they only delete their own companies.
    if user.role == "employee" and user.department != "accounts":
        if existing.get("created_by") != user.user_db_id:
            raise HTTPException(status_code=403, detail="Access denied")

    await db["companies"].delete_one({"_id": company_id})
    return {"message": "Company deleted successfully"}

