from fastapi import APIRouter, HTTPException
from app.config import get_settings
from app.database import get_db
from app.models.schemas import LoginRequest, LoginResponse
from app.services.security import create_access_token, hash_password, verify_password

import uuid


router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    """
    Simple email/password login for MongoDB-backed app.
    - If the bootstrap admin user doesn't exist yet, create it on first login attempt.
    """
    settings = get_settings()
    db = get_db()

    email = payload.email.strip().lower()
    password = payload.password
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user_doc = await db["users"].find_one({"email": email})

    # Bootstrap admin (optional)
    if not user_doc and email == settings.BOOTSTRAP_ADMIN_EMAIL.strip().lower():
        user_id = str(uuid.uuid4())
        user_doc = {
            "_id": user_id,
            "name": "Admin",
            "email": email,
            "password_hash": hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD),
            "role": "admin",
            "status": "active",
            # Default bootstrap admin to Accounts department for full access
            "department": "accounts",
        }
        await db["users"].insert_one(user_doc)

    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user_doc.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="User account is inactive")

    if not verify_password(password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    role = user_doc.get("role", "employee")
    department = user_doc.get("department", "accounts")
    token = create_access_token(subject=str(user_doc["_id"]), role=role)

    return LoginResponse(
        access_token=token,
        user={
            "id": str(user_doc["_id"]),
            "name": user_doc.get("name", "User"),
            "email": user_doc.get("email", ""),
            "role": role,
            "status": user_doc.get("status", "active"),
            "department": department,
        },
    )

