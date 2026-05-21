"""
Users Router — User management
Accessible by superadmin and admin.
"""

from fastapi import APIRouter, Depends, HTTPException
from app.auth.middleware import CurrentUser, get_current_user, require_role
from app.database import get_db
from app.models.schemas import UserCreate, UserUpdate
from app.services.security import hash_password

import uuid
from datetime import datetime, timezone


router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/me")
async def get_my_profile(
    user: CurrentUser = Depends(get_current_user),
):
    """Get current authenticated user's profile. No role restriction."""
    return {
        "id": user.user_db_id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "status": "active",
        "department": user.department,
    }


@router.get("")
async def list_users(
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """List all users with their roles."""
    db = get_db()
    cursor = db["users"].find({}, {"password_hash": 0}).sort("created_at", -1)
    data = []
    async for doc in cursor:
        data.append(
            {
                "id": str(doc["_id"]),
                "name": doc.get("name", ""),
                "email": doc.get("email", ""),
                "role": doc.get("role", "employee"),
                "status": doc.get("status", "active"),
                "department": (doc.get("department") or "accounts"),
                "created_at": doc.get("created_at"),
            }
        )
    return {"data": data}


@router.post("")
async def create_user(
    new_user: UserCreate,
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Create a new user in MongoDB."""
    db = get_db()
    email = new_user.email.strip().lower()
    if await db["users"].find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    if new_user.role_name not in ("superadmin", "admin", "employee"):
        raise HTTPException(status_code=400, detail="Invalid role")

    valid_departments = {
        "tech",
        "marketing",
        "sales",
        "post_production",
        "content",
        "accounts",
    }
    department_normalized = new_user.department.strip().lower()
    if department_normalized not in valid_departments:
        raise HTTPException(
            status_code=400,
            detail="Invalid department. Must be one of: tech, marketing, sales, post_production, content, accounts",
        )

    user_id = str(uuid.uuid4())
    doc = {
        "_id": user_id,
        "name": new_user.name,
        "email": email,
        "password_hash": hash_password(new_user.password),
        "role": new_user.role_name,
        "status": "active",
        "department": department_normalized,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db["users"].insert_one(doc)
    return {
        "message": "User created successfully",
        "user": {
            "id": user_id,
            "name": doc["name"],
            "email": doc["email"],
            "role": doc["role"],
            "status": doc["status"],
            "department": doc["department"],
        },
    }


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    user: CurrentUser = Depends(require_role("superadmin", "admin")),
):
    """Update a user's name, role, status, or department."""
    db = get_db()
    existing = await db["users"].find_one({"_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    update_data: dict = {}
    if user_update.name is not None:
        update_data["name"] = user_update.name
    if user_update.status is not None:
        update_data["status"] = user_update.status
    if user_update.role_name is not None:
        if user_update.role_name not in ("superadmin", "admin", "employee"):
            raise HTTPException(status_code=400, detail="Invalid role")
        update_data["role"] = user_update.role_name
    if user_update.department is not None:
        valid_departments = {
            "tech",
            "marketing",
            "sales",
            "post_production",
            "content",
            "accounts",
        }
        department_normalized = user_update.department.strip().lower()
        if department_normalized not in valid_departments:
            raise HTTPException(
                status_code=400,
                detail="Invalid department. Must be one of: tech, marketing, sales, post_production, content, accounts",
            )
        update_data["department"] = department_normalized

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db["users"].update_one({"_id": user_id}, {"$set": update_data})
    return {"message": "User updated successfully"}
